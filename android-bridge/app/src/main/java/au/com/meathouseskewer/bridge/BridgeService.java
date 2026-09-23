package au.com.meathouseskewer.bridge;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.wifi.WifiManager;
import android.os.*;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;

public class BridgeService extends Service {
    public static final String ACTION_STOP="STOP";
    private static final String CHANNEL="bridge";
    private static final int NOTIFICATION_ID=1001;
    private static final String LOCAL_ACK_PREFIX="printed_";
    private static final long ACTIVE_POLL_MS=1000L;
    private static final long IDLE_POLL_MS=4000L;
    private static final long ERROR_MIN_MS=2000L;
    private static final long ERROR_MAX_MS=30000L;
    private static final long HEARTBEAT_MS=30000L;

    private final ScheduledExecutorService executor=Executors.newSingleThreadScheduledExecutor();
    private final Object scheduleLock=new Object();
    private ScheduledFuture<?> scheduledFuture;
    private volatile boolean busy=false;
    private volatile boolean stopping=false;
    private volatile boolean pollAgainSoon=false;

    private SharedPreferences prefs;
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;
    private boolean networkCallbackRegistered=false;

    private int consecutiveErrors=0;
    private long lastHeartbeatAttemptAt=0L;
    private boolean heartbeatHealthy=false;
    private String lastStatus="";

    private final int[] printerFailures=new int[]{0,0};
    private final long[] printerRetryAt=new long[]{0L,0L};

    @Override public void onCreate(){
        super.onCreate();
        prefs=getSharedPreferences(BridgeConfig.PREFS,MODE_PRIVATE);
        createChannel();
        Notification n=notification("Bridge starting...");
        if(Build.VERSION.SDK_INT>=34)startForeground(NOTIFICATION_ID,n,ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(NOTIFICATION_ID,n);

        prefs.edit()
                .putBoolean("enabled",true)
                .putBoolean("service_alive",true)
                .putLong("service_started_at",System.currentTimeMillis())
                .putString("status","Bridge starting...")
                .apply();

        acquireLocks();
        registerNetworkCallback();
        WatchdogReceiver.forceSchedule(this,120000L);
        setStatus("Bridge running · connecting to server...");
    }

    @Override public int onStartCommand(Intent intent,int flags,int startId){
        if(intent!=null&&ACTION_STOP.equals(intent.getAction())){
            stopBridge();
            return START_NOT_STICKY;
        }
        stopping=false;
        prefs.edit().putBoolean("enabled",true).putBoolean("service_alive",true).apply();
        ensureLocks();
        WatchdogReceiver.arm(this);
        triggerSoon();
        return START_STICKY;
    }

    @Override public void onTaskRemoved(Intent rootIntent){
        if(prefs!=null&&prefs.getBoolean("enabled",false)){
            prefs.edit()
                    .putBoolean("service_alive",false)
                    .putString("status","Bridge recovering after task removal...")
                    .apply();
            WatchdogReceiver.forceSchedule(this,2500L);
        }
        super.onTaskRemoved(rootIntent);
    }

    @Override public void onDestroy(){
        unregisterNetworkCallback();
        releaseLocks();
        if(prefs!=null){
            boolean enabled=prefs.getBoolean("enabled",false);
            prefs.edit()
                    .putBoolean("service_alive",false)
                    .putBoolean("heartbeatHealthy",false)
                    .putString("status",enabled?"Service restarting...":"Stopped")
                    .apply();
            if(enabled&&!stopping)WatchdogReceiver.forceSchedule(this,3500L);
        }
        synchronized(scheduleLock){
            if(scheduledFuture!=null)scheduledFuture.cancel(true);
            scheduledFuture=null;
        }
        executor.shutdownNow();
        super.onDestroy();
    }

    @Override public void onLowMemory(){
        ensureLocks();
        super.onLowMemory();
    }

    @Override public android.os.IBinder onBind(Intent intent){return null;}

    private void stopBridge(){
        stopping=true;
        if(prefs!=null)prefs.edit()
                .putBoolean("enabled",false)
                .putBoolean("service_alive",false)
                .putBoolean("heartbeatHealthy",false)
                .putString("status","Stopped")
                .apply();

        WatchdogReceiver.cancel(this);
        unregisterNetworkCallback();
        releaseLocks();

        synchronized(scheduleLock){
            if(scheduledFuture!=null)scheduledFuture.cancel(true);
            scheduledFuture=null;
        }
        executor.shutdownNow();
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    private void triggerSoon(){
        synchronized(scheduleLock){
            if(stopping||executor.isShutdown())return;
            if(busy){
                pollAgainSoon=true;
                return;
            }
            if(scheduledFuture!=null&&!scheduledFuture.isDone())scheduledFuture.cancel(false);
            scheduledFuture=executor.schedule(this::runPollCycle,0L,TimeUnit.MILLISECONDS);
        }
    }

    private void scheduleNext(long delayMs){
        synchronized(scheduleLock){
            if(stopping||executor.isShutdown())return;
            scheduledFuture=executor.schedule(this::runPollCycle,Math.max(250L,delayMs),TimeUnit.MILLISECONDS);
        }
    }

    private void runPollCycle(){
        if(stopping)return;
        busy=true;
        long nextDelay=IDLE_POLL_MS;
        try{
            ensureLocks();
            nextDelay=pollOnce();
        }catch(Throwable t){
            consecutiveErrors++;
            recordPoll(false);
            setStatus("Bridge recovering · "+shortMsg(t));
            nextDelay=errorBackoffMs();
        }finally{
            WatchdogReceiver.arm(this);
            busy=false;
            synchronized(scheduleLock){scheduledFuture=null;}
            if(pollAgainSoon){
                pollAgainSoon=false;
                nextDelay=500L;
            }
            scheduleNext(nextDelay);
        }
    }

    private long pollOnce(){
        String secret=BridgeConfig.BRIDGE_KEY;
        try{
            long now=System.currentTimeMillis();
            String ip1=prefs.getString("ip1","192.168.0.192");
            String ip2=prefs.getString("ip2","192.168.0.193");
            int port=prefs.getInt("port",9100);

            if(now-lastHeartbeatAttemptAt>=HEARTBEAT_MS){
                lastHeartbeatAttemptAt=now;
                try{
                    heartbeat(secret,ip1,ip2,port);
                    heartbeatHealthy=true;
                    prefs.edit()
                            .putBoolean("heartbeatHealthy",true)
                            .putLong("lastHeartbeatOk",now)
                            .remove("heartbeatError")
                            .apply();
                }catch(Throwable hb){
                    heartbeatHealthy=false;
                    prefs.edit()
                            .putBoolean("heartbeatHealthy",false)
                            .putString("heartbeatError",shortMsg(hb))
                            .apply();
                }
            }

            JSONArray jobs=rpcJobs(secret);
            consecutiveErrors=0;
            recordPoll(true);

            if(jobs.length()==0){
                setStatus(heartbeatHealthy?"Heartbeat OK · waiting for orders":"Server online · heartbeat retrying");
                return IDLE_POLL_MS;
            }

            boolean anyPending=false;
            for(int i=0;i<jobs.length();i++){
                JSONObject job=jobs.getJSONObject(i);
                String jid=job.getString("job_id");
                String table=job.optString("table_name","table");

                if(!job.optBoolean("printer1_done")){
                    anyPending=true;
                    processPrinter(secret,jid,1,ip1,port,job,table);
                }else{
                    clearLocalPrinted(jid,1);
                }

                if(!job.optBoolean("printer2_done")){
                    anyPending=true;
                    processPrinter(secret,jid,2,ip2,port,job,table);
                }else{
                    clearLocalPrinted(jid,2);
                }
            }
            return anyPending?ACTIVE_POLL_MS:IDLE_POLL_MS;
        }catch(Throwable e){
            consecutiveErrors++;
            recordPoll(false);
            setStatus("Server reconnecting · "+shortMsg(e));
            return errorBackoffMs();
        }
    }

    private void processPrinter(String secret,String jid,int printer,String ip,int port,JSONObject job,String table){
        int idx=printer-1;
        long now=System.currentTimeMillis();
        if(now<printerRetryAt[idx])return;

        try{
            if(isLocalPrinted(jid,printer)){
                setStatus("Confirming "+table+" Printer "+printer+"...");
                ackWithRetry(secret,jid,printer);
                clearLocalPrinted(jid,printer);
                markPrinterSuccess(printer);
                setStatus("Confirmed "+table+" Printer "+printer);
                return;
            }

            setStatus("Printing "+table+" on Printer "+printer+"...");
            PrinterClient.printOrder(ip,port,job);
            markLocalPrinted(jid,printer);

            ackWithRetry(secret,jid,printer);
            clearLocalPrinted(jid,printer);
            markPrinterSuccess(printer);

            prefs.edit().putLong("last_print_at",System.currentTimeMillis()).apply();
            setStatus("Printed "+table+" on Printer "+printer);
        }catch(Throwable e){
            markPrinterFailure(printer,e);
            setStatus("Printer "+printer+" reconnecting · "+shortMsg(e));
        }
    }

    private void markPrinterSuccess(int printer){
        int idx=printer-1;
        printerFailures[idx]=0;
        printerRetryAt[idx]=0L;
        prefs.edit()
                .putBoolean("printer"+printer+"_online",true)
                .putLong("printer"+printer+"_last_ok",System.currentTimeMillis())
                .remove("printer"+printer+"_error")
                .apply();
    }

    private void markPrinterFailure(int printer,Throwable e){
        int idx=printer-1;
        printerFailures[idx]=Math.min(10,printerFailures[idx]+1);
        long delay=Math.min(30000L,2000L*(1L<<Math.min(4,printerFailures[idx]-1)));
        printerRetryAt[idx]=System.currentTimeMillis()+delay;

        prefs.edit()
                .putBoolean("printer"+printer+"_online",false)
                .putString("printer"+printer+"_error",shortMsg(e))
                .putLong("printer"+printer+"_retry_at",printerRetryAt[idx])
                .apply();
    }

    private long errorBackoffMs(){
        int shift=Math.min(4,Math.max(0,consecutiveErrors-1));
        return Math.min(ERROR_MAX_MS,ERROR_MIN_MS*(1L<<shift));
    }

    private void recordPoll(boolean success){
        long now=System.currentTimeMillis();
        SharedPreferences.Editor e=prefs.edit()
                .putBoolean("service_alive",true)
                .putLong("last_poll_at",now)
                .putInt("consecutive_errors",consecutiveErrors);
        if(success)e.putLong("last_success_at",now);
        e.apply();
    }

    private void heartbeat(String secret,String ip1,String ip2,int port)throws Exception{
        long p1Latency=PrinterClient.probe(ip1,port);
        long p2Latency=PrinterClient.probe(ip2,port);
        boolean p1Online=p1Latency>=0;
        boolean p2Online=p2Latency>=0;

        prefs.edit()
                .putBoolean("printer1_online",p1Online)
                .putLong("printer1_latency_ms",Math.max(0,p1Latency))
                .putBoolean("printer2_online",p2Online)
                .putLong("printer2_latency_ms",Math.max(0,p2Latency))
                .apply();

        JSONObject info=new JSONObject();
        info.put("manufacturer",Build.MANUFACTURER);
        info.put("model",Build.MODEL);
        info.put("android",Build.VERSION.RELEASE);
        info.put("sdk",Build.VERSION.SDK_INT);
        info.put("app_version",BuildConfig.VERSION_NAME);
        info.put("cpu_lock",wakeLock!=null&&wakeLock.isHeld());
        info.put("wifi_lock",wifiLock!=null&&wifiLock.isHeld());
        info.put("consecutive_errors",consecutiveErrors);
        info.put("printer1_ip",ip1);
        info.put("printer1_online",p1Online);
        info.put("printer1_latency_ms",Math.max(0,p1Latency));
        info.put("printer2_ip",ip2);
        info.put("printer2_online",p2Online);
        info.put("printer2_latency_ms",Math.max(0,p2Latency));
        info.put("last_print_at",prefs.getLong("last_print_at",0L));

        JSONObject body=new JSONObject()
                .put("p_secret",secret)
                .put("p_status","online")
                .put("p_device_info",info);

        post(BridgeConfig.SUPABASE_URL+"/rest/v1/rpc/bridge_heartbeat",body.toString());
    }

    private JSONArray rpcJobs(String secret)throws Exception{
        String body=new JSONObject().put("p_secret",secret).toString();
        return new JSONArray(post(BridgeConfig.SUPABASE_URL+"/rest/v1/rpc/bridge_get_print_jobs",body));
    }

    private void ack(String secret,String jobId,int printer)throws Exception{
        JSONObject body=new JSONObject()
                .put("p_secret",secret)
                .put("p_job_id",jobId)
                .put("p_printer",printer);
        post(BridgeConfig.SUPABASE_URL+"/rest/v1/rpc/bridge_ack_print_job",body.toString());
    }

    private void ackWithRetry(String secret,String jobId,int printer)throws Exception{
        Exception last=null;
        for(int attempt=1;attempt<=3;attempt++){
            try{
                ack(secret,jobId,printer);
                return;
            }catch(Exception e){
                last=e;
                try{Thread.sleep(350L*attempt);}
                catch(InterruptedException ie){
                    Thread.currentThread().interrupt();
                    throw ie;
                }
            }
        }
        throw last==null?new IOException("ACK failed"):last;
    }

    private String localPrintedKey(String jobId,int printer){return LOCAL_ACK_PREFIX+jobId+"_p"+printer;}
    private boolean isLocalPrinted(String jobId,int printer){return prefs.getBoolean(localPrintedKey(jobId,printer),false);}
    private void markLocalPrinted(String jobId,int printer){prefs.edit().putBoolean(localPrintedKey(jobId,printer),true).commit();}
    private void clearLocalPrinted(String jobId,int printer){prefs.edit().remove(localPrintedKey(jobId,printer)).apply();}

    private String post(String url,String body)throws Exception{
        HttpURLConnection c=(HttpURLConnection)new URL(url).openConnection();
        try{
            c.setConnectTimeout(7000);
            c.setReadTimeout(10000);
            c.setRequestMethod("POST");
            c.setDoOutput(true);
            c.setUseCaches(false);
            c.setRequestProperty("Content-Type","application/json");
            c.setRequestProperty("Accept","application/json");
            c.setRequestProperty("Connection","keep-alive");
            c.setRequestProperty("apikey",BridgeConfig.SUPABASE_KEY);

            try(OutputStream o=c.getOutputStream()){
                o.write(body.getBytes(StandardCharsets.UTF_8));
                o.flush();
            }

            int code=c.getResponseCode();
            InputStream in=code>=200&&code<300?c.getInputStream():c.getErrorStream();
            String text=read(in);
            if(code<200||code>=300)throw new IOException("HTTP "+code+" "+text);
            return text;
        }finally{
            c.disconnect();
        }
    }

    private static String read(InputStream in)throws Exception{
        if(in==null)return"";
        ByteArrayOutputStream b=new ByteArrayOutputStream();
        byte[] buf=new byte[4096];
        int n;
        while((n=in.read(buf))>0)b.write(buf,0,n);
        return new String(b.toByteArray(),StandardCharsets.UTF_8);
    }

    private void setStatus(String s){
        if(prefs==null||s==null)return;
        if(s.equals(lastStatus))return;
        lastStatus=s;

        prefs.edit()
                .putBoolean("enabled",true)
                .putBoolean("service_alive",true)
                .putString("status",s)
                .putLong("statusAt",System.currentTimeMillis())
                .apply();

        try{
            ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).notify(NOTIFICATION_ID,notification(s));
        }catch(Throwable ignored){}
    }

    private Notification notification(String text){
        Intent open=new Intent(this,MainActivity.class);
        PendingIntent pi=PendingIntent.getActivity(this,0,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this,CHANNEL)
                .setContentTitle("Meat House Skewer Bridge")
                .setContentText(text)
                .setSmallIcon(android.R.drawable.stat_notify_sync)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setCategory(Notification.CATEGORY_SERVICE)
                .setContentIntent(pi)
                .build();
    }

    private void createChannel(){
        if(Build.VERSION.SDK_INT>=26){
            NotificationChannel c=new NotificationChannel(CHANNEL,"Skewer Bridge",NotificationManager.IMPORTANCE_LOW);
            c.setDescription("Keeps Meat House kitchen printing active while the screen is locked");
            c.setShowBadge(false);
            ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(c);
        }
    }

    private void acquireLocks(){
        acquireWakeLock();
        acquireWifiLock();
    }

    private void ensureLocks(){
        try{if(wakeLock==null||!wakeLock.isHeld())acquireWakeLock();}catch(Throwable ignored){}
        try{if(wifiLock==null||!wifiLock.isHeld())acquireWifiLock();}catch(Throwable ignored){}
    }

    private void acquireWakeLock(){
        try{
            PowerManager pm=(PowerManager)getSystemService(POWER_SERVICE);
            wakeLock=pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"MeatHouse:BridgeCpu");
            wakeLock.setReferenceCounted(false);
            wakeLock.acquire();
            prefs.edit().putBoolean("cpu_lock",true).apply();
        }catch(Throwable ignored){
            if(prefs!=null)prefs.edit().putBoolean("cpu_lock",false).apply();
        }
    }

    @SuppressWarnings("deprecation")
    private void acquireWifiLock(){
        try{
            WifiManager wm=(WifiManager)getApplicationContext().getSystemService(WIFI_SERVICE);
            wifiLock=wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF,"MeatHouse:BridgeWifi");
            wifiLock.setReferenceCounted(false);
            wifiLock.acquire();
            prefs.edit().putBoolean("wifi_lock",true).apply();
        }catch(Throwable ignored){
            if(prefs!=null)prefs.edit().putBoolean("wifi_lock",false).apply();
        }
    }

    private void releaseLocks(){
        try{if(wakeLock!=null&&wakeLock.isHeld())wakeLock.release();}catch(Throwable ignored){}
        try{if(wifiLock!=null&&wifiLock.isHeld())wifiLock.release();}catch(Throwable ignored){}
        if(prefs!=null)prefs.edit().putBoolean("cpu_lock",false).putBoolean("wifi_lock",false).apply();
    }

    private void registerNetworkCallback(){
        try{
            connectivityManager=(ConnectivityManager)getSystemService(CONNECTIVITY_SERVICE);
            if(connectivityManager==null)return;

            networkCallback=new ConnectivityManager.NetworkCallback(){
                @Override public void onAvailable(Network network){
                    printerRetryAt[0]=0L;
                    printerRetryAt[1]=0L;
                    setStatus("Network available · reconnecting...");
                    triggerSoon();
                }

                @Override public void onLost(Network network){
                    heartbeatHealthy=false;
                    prefs.edit().putBoolean("heartbeatHealthy",false).apply();
                    setStatus("Network disconnected · waiting to reconnect...");
                }
            };

            connectivityManager.registerDefaultNetworkCallback(networkCallback);
            networkCallbackRegistered=true;
        }catch(Throwable ignored){}
    }

    private void unregisterNetworkCallback(){
        try{
            if(networkCallbackRegistered&&connectivityManager!=null&&networkCallback!=null){
                connectivityManager.unregisterNetworkCallback(networkCallback);
            }
        }catch(Throwable ignored){}
        networkCallbackRegistered=false;
    }

    private static String shortMsg(Throwable e){
        String s=e.getMessage();
        if(s==null||s.trim().isEmpty())s=e.getClass().getSimpleName();
        return s.length()>160?s.substring(0,160):s;
    }
}
