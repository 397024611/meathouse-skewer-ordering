package au.com.meathouseskewer.bridge;

import android.Manifest;
import android.app.Activity;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;
import android.text.InputType;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.*;

public class MainActivity extends Activity {
    private EditText ip1,ip2,port;
    private TextView statusText,statusPill,backgroundState,serviceHealth,printerHealth,updateStatus,updateNotes;
    private Button start,stop,updateButton;
    private AppUpdater.UpdateInfo pendingUpdate;
    private boolean updateCheckInFlight=false;
    private final Handler h=new Handler(Looper.getMainLooper());
    private long lastRecoveryAttempt=0L;
    private final int burgundy=Color.rgb(105,32,31),ink=Color.rgb(32,28,26),cream=Color.rgb(248,246,242),line=Color.rgb(225,220,214);

    @Override public void onCreate(Bundle b){
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},5);
        buildUi();
        h.post(refresh);
        checkForUpdates(false);
    }

    @Override protected void onResume(){
        super.onResume();
        updateBackgroundState();
        maybeRecoverService(true);
        if(pendingUpdate!=null&&updateButton!=null){updateButton.setEnabled(true);updateButton.setText("UPDATE NOW");}
    }

    private void buildUi(){
        SharedPreferences p=getSharedPreferences(BridgeConfig.PREFS,MODE_PRIVATE);
        ScrollView sv=new ScrollView(this);sv.setBackgroundColor(cream);
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setPadding(dp(20),dp(22),dp(20),dp(36));sv.addView(root);

        root.addView(text("MEAT HOUSE",32,true,ink));
        TextView sub=text("SKEWER PRINT BRIDGE",14,true,burgundy);sub.setLetterSpacing(.12f);root.addView(sub);
        TextView desc=text("Always-on dual printer controller · stability v2",13,false,Color.DKGRAY);desc.setPadding(0,0,0,dp(16));root.addView(desc);

        LinearLayout statusCard=card();statusCard.setPadding(dp(18),dp(16),dp(18),dp(16));
        statusPill=text("● STOPPED",13,true,Color.rgb(130,130,130));statusCard.addView(statusPill);
        statusText=text(p.getString("status","Stopped"),17,true,ink);statusText.setPadding(0,dp(6),0,0);statusCard.addView(statusText);
        serviceHealth=text("Waiting for bridge health…",12,false,Color.DKGRAY);serviceHealth.setPadding(0,dp(5),0,0);statusCard.addView(serviceHealth);
        printerHealth=text("Waiting for printer health…",12,false,Color.DKGRAY);printerHealth.setPadding(0,dp(4),0,0);statusCard.addView(printerHealth);
        root.addView(statusCard);

        section(root,"PRINTERS");
        LinearLayout pcard=card();pcard.setPadding(dp(16),dp(12),dp(16),dp(14));
        pcard.addView(label("Printer 1"));
        ip1=field("192.168.0.192",p.getString("ip1","192.168.0.192"));pcard.addView(ip1);
        pcard.addView(label("Printer 2"));
        ip2=field("192.168.0.193",p.getString("ip2","192.168.0.193"));pcard.addView(ip2);
        pcard.addView(label("TCP Port"));
        port=field("9100",String.valueOf(p.getInt("port",9100)));port.setInputType(InputType.TYPE_CLASS_NUMBER);pcard.addView(port);
        root.addView(pcard);

        LinearLayout tests=new LinearLayout(this);tests.setOrientation(LinearLayout.HORIZONTAL);tests.setPadding(0,dp(10),0,0);
        Button t1=smallButton("TEST P1"),t2=smallButton("TEST P2"),tb=smallButton("TEST BOTH");tests.addView(t1);tests.addView(t2);tests.addView(tb);root.addView(tests);

        section(root,"ALWAYS-ON PROTECTION");
        LinearLayout bg=card();bg.setPadding(dp(16),dp(14),dp(16),dp(14));
        backgroundState=text("Checking always-on protection…",14,true,ink);bg.addView(backgroundState);
        TextView bgHelp=text("Uses special-use foreground service, CPU/Wi-Fi locks, watchdog recovery and network reconnect detection. Keep this phone on store Wi-Fi and power.",12,false,Color.DKGRAY);bgHelp.setPadding(0,dp(4),0,dp(8));bg.addView(bgHelp);
        Button allow=secondaryButton("ENABLE ALWAYS-ON PROTECTION");bg.addView(allow);root.addView(bg);

        section(root,"SOFTWARE UPDATE");
        LinearLayout updater=card();updater.setPadding(dp(16),dp(14),dp(16),dp(14));
        updateStatus=text("Checking for updates…",14,true,ink);updater.addView(updateStatus);
        updateNotes=text("Current version · v"+AppUpdater.currentVersionName(this),12,false,Color.DKGRAY);updateNotes.setPadding(0,dp(4),0,dp(8));updater.addView(updateNotes);
        updateButton=secondaryButton("CHECK FOR UPDATE");updater.addView(updateButton);root.addView(updater);

        start=primaryButton("START BRIDGE");root.addView(start);
        stop=secondaryButton("STOP BRIDGE");LinearLayout.LayoutParams slp=(LinearLayout.LayoutParams)stop.getLayoutParams();slp.setMargins(0,dp(10),0,0);stop.setLayoutParams(slp);root.addView(stop);

        TextView footer=text("v"+AppUpdater.currentVersionName(this)+" · ESC/POS · TCP 9100 · signed auto-update enabled",11,false,Color.GRAY);footer.setGravity(Gravity.CENTER);footer.setPadding(0,dp(18),0,0);root.addView(footer);
        setContentView(sv);

        t1.setOnClickListener(v->test(1));t2.setOnClickListener(v->test(2));tb.setOnClickListener(v->{test(1);test(2);});
        start.setOnClickListener(v->startBridge());stop.setOnClickListener(v->stopBridge());allow.setOnClickListener(v->requestBackgroundAccess());
        updateButton.setOnClickListener(v->{if(pendingUpdate!=null)beginUpdate();else checkForUpdates(true);});
        updateBackgroundState();
    }

    private void checkForUpdates(boolean manual){
        if(updateCheckInFlight)return;
        updateCheckInFlight=true;
        if(updateStatus!=null)updateStatus.setText(manual?"Checking for updates…":"Automatic update check…");
        if(updateNotes!=null)updateNotes.setText("Current version · v"+AppUpdater.currentVersionName(this));
        if(updateButton!=null){updateButton.setEnabled(false);updateButton.setText("CHECKING…");}

        AppUpdater.check(this,new AppUpdater.CheckListener(){
            @Override public void onUpdateAvailable(AppUpdater.UpdateInfo info){
                updateCheckInFlight=false;
                pendingUpdate=info;
                updateStatus.setText("UPDATE AVAILABLE · v"+info.versionName);
                updateStatus.setTextColor(Color.rgb(176,105,20));
                updateNotes.setText(info.notes.isEmpty()?"A newer signed Bridge version is ready.":info.notes);
                updateButton.setText("UPDATE NOW");
                updateButton.setEnabled(true);
            }

            @Override public void onUpToDate(String versionName){
                updateCheckInFlight=false;
                pendingUpdate=null;
                updateStatus.setText("UP TO DATE · v"+versionName);
                updateStatus.setTextColor(Color.rgb(42,120,72));
                updateNotes.setText("Automatic update checking is active.");
                updateButton.setText("CHECK AGAIN");
                updateButton.setEnabled(true);
            }

            @Override public void onError(String message){
                updateCheckInFlight=false;
                updateStatus.setText("UPDATE CHECK UNAVAILABLE");
                updateStatus.setTextColor(Color.rgb(176,105,20));
                updateNotes.setText(message);
                updateButton.setText("TRY AGAIN");
                updateButton.setEnabled(true);
            }
        });
    }

    private void beginUpdate(){
        if(pendingUpdate==null){checkForUpdates(true);return;}
        updateButton.setEnabled(false);
        updateButton.setText("PREPARING…");
        AppUpdater.downloadAndInstall(this,pendingUpdate,new AppUpdater.InstallListener(){
            @Override public void onStatus(String message){
                updateStatus.setText(message);
                updateStatus.setTextColor(ink);
                updateNotes.setText("Do not uninstall the current app. Android will update it in place.");
            }

            @Override public void onPermissionRequired(){
                updateStatus.setText("INSTALL PERMISSION REQUIRED");
                updateStatus.setTextColor(Color.rgb(176,105,20));
                updateNotes.setText("Enable 'Allow from this source', return here, then tap UPDATE NOW again.");
                updateButton.setText("UPDATE NOW");
                updateButton.setEnabled(true);
            }

            @Override public void onError(String message){
                updateStatus.setText("UPDATE FAILED");
                updateStatus.setTextColor(Color.rgb(176,105,20));
                updateNotes.setText(message);
                updateButton.setText("RETRY UPDATE");
                updateButton.setEnabled(true);
            }
        });
    }

    private boolean batteryProtectionOk(){
        if(Build.VERSION.SDK_INT<23)return true;
        PowerManager pm=(PowerManager)getSystemService(POWER_SERVICE);
        return pm!=null&&pm.isIgnoringBatteryOptimizations(getPackageName());
    }

    private void requestBackgroundAccess(){
        try{
            if(Build.VERSION.SDK_INT>=23&&!batteryProtectionOk()){
                startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,Uri.parse("package:"+getPackageName())));
                return;
            }
            if(Build.VERSION.SDK_INT>=31&&!WatchdogReceiver.exactAlarmAllowed(this)){
                startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,Uri.parse("package:"+getPackageName())));
                return;
            }
            toast("Always-on protection is enabled.");
        }catch(Exception e){
            try{startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+getPackageName())));}catch(Exception ignored){}
        }
    }

    private void updateBackgroundState(){
        boolean batteryOk=batteryProtectionOk();
        boolean alarmOk=WatchdogReceiver.exactAlarmAllowed(this);
        boolean ok=batteryOk&&alarmOk;
        if(backgroundState!=null){
            backgroundState.setText((batteryOk?"Battery unrestricted ✓":"Battery restriction ⚠")+" · "+(alarmOk?"Watchdog alarm ✓":"Watchdog alarm ⚠")+" · Screen awake ✓");
            backgroundState.setTextColor(ok?Color.rgb(42,120,72):Color.rgb(176,105,20));
        }
    }

    private void startBridge(){
        try{
            save();
            getSharedPreferences(BridgeConfig.PREFS,MODE_PRIVATE).edit()
                    .putBoolean("enabled",true).putBoolean("service_alive",false)
                    .putBoolean("heartbeatHealthy",false).putString("status","Starting...").apply();
            startBridgeService();
            WatchdogReceiver.forceSchedule(this,120000L);
        }catch(Exception e){
            getSharedPreferences(BridgeConfig.PREFS,MODE_PRIVATE).edit()
                    .putBoolean("enabled",false).putBoolean("service_alive",false)
                    .putString("status","Start failed: "+e.getMessage()).apply();
            toast("Start failed: "+e.getMessage());
        }
    }

    private void startBridgeService(){
        Intent i=new Intent(this,BridgeService.class);
        if(Build.VERSION.SDK_INT>=26)startForegroundService(i);else startService(i);
    }

    private void maybeRecoverService(boolean force){
        SharedPreferences p=getSharedPreferences(BridgeConfig.PREFS,MODE_PRIVATE);
        if(!p.getBoolean("enabled",false))return;
        long now=System.currentTimeMillis(),last=p.getLong("last_poll_at",0L);
        boolean stale=last==0L||now-last>20000L;
        if(!stale)return;
        if(!force&&now-lastRecoveryAttempt<30000L)return;
        lastRecoveryAttempt=now;
        try{startBridgeService();WatchdogReceiver.forceSchedule(this,120000L);}catch(Throwable ignored){}
    }

    private void stopBridge(){
        try{
            Intent i=new Intent(this,BridgeService.class);i.setAction(BridgeService.ACTION_STOP);
            if(Build.VERSION.SDK_INT>=26)startForegroundService(i);else startService(i);
        }catch(Exception e){stopService(new Intent(this,BridgeService.class));}
        WatchdogReceiver.cancel(this);
        toast("Bridge stopped");
    }

    private void save(){
        int prt=9100;try{prt=Integer.parseInt(port.getText().toString().trim());}catch(Exception ignored){}
        getSharedPreferences(BridgeConfig.PREFS,MODE_PRIVATE).edit()
                .putString("ip1",ip1.getText().toString().trim())
                .putString("ip2",ip2.getText().toString().trim())
                .putInt("port",prt).apply();
    }

    private void test(int which){
        save();
        String host=which==1?ip1.getText().toString().trim():ip2.getText().toString().trim();
        int prt=9100;try{prt=Integer.parseInt(port.getText().toString().trim());}catch(Exception ignored){}
        final int fp=prt;
        new Thread(()->{
            try{
                PrinterClient.printTest(host,fp,"PRINTER "+which);
                runOnUiThread(()->toast("Printer "+which+" OK"));
            }catch(Exception e){
                runOnUiThread(()->toast("Printer "+which+" failed: "+e.getMessage()));
            }
        }).start();
    }

    private String healthLine(SharedPreferences p){
        boolean cpu=p.getBoolean("cpu_lock",false),wifi=p.getBoolean("wifi_lock",false);
        long last=p.getLong("last_success_at",0L),now=System.currentTimeMillis();
        String contact;
        if(last<=0L)contact="server: waiting";
        else{
            long sec=Math.max(0L,(now-last)/1000L);
            contact="server: "+(sec<60?sec+"s ago":(sec/60)+"m ago");
        }
        return (cpu?"CPU lock ✓":"CPU lock ⚠")+" · "+(wifi?"Wi-Fi lock ✓":"Wi-Fi lock ⚠")+" · "+contact;
    }

    private String printerLine(SharedPreferences p,int which){
        boolean online=p.getBoolean("printer"+which+"_online",false);
        long latency=p.getLong("printer"+which+"_latency_ms",0L);
        String error=p.getString("printer"+which+"_error","");
        if(online)return "P"+which+" ✓ ONLINE"+(latency>0?" · "+latency+"ms":"");
        return "P"+which+" ⚠ OFFLINE"+(error.isEmpty()?"":" · "+error);
    }

    private final Runnable refresh=new Runnable(){public void run(){
        SharedPreferences p=getSharedPreferences(BridgeConfig.PREFS,MODE_PRIVATE);
        String s=p.getString("status",p.getBoolean("enabled",false)?"Starting...":"Stopped");
        if(statusText!=null)statusText.setText(s);

        boolean enabled=p.getBoolean("enabled",false);
        long last=p.getLong("last_poll_at",0L);
        long age=last<=0L?Long.MAX_VALUE:System.currentTimeMillis()-last;
        boolean healthy=enabled&&age<20000L;

        if(statusPill!=null){
            statusPill.setText(!enabled?"● STOPPED":healthy?"● BRIDGE ONLINE":"● RECOVERING");
            statusPill.setTextColor(!enabled?Color.rgb(130,130,130):healthy?Color.rgb(42,120,72):Color.rgb(176,105,20));
        }
        if(serviceHealth!=null){
            serviceHealth.setText(healthLine(p));
            serviceHealth.setTextColor(healthy?Color.rgb(42,120,72):enabled?Color.rgb(176,105,20):Color.DKGRAY);
        }
        if(printerHealth!=null){
            boolean p1=p.getBoolean("printer1_online",false),p2=p.getBoolean("printer2_online",false);
            printerHealth.setText(printerLine(p,1)+"\n"+printerLine(p,2));
            printerHealth.setTextColor(p1&&p2?Color.rgb(42,120,72):Color.rgb(176,105,20));
        }

        if(start!=null)start.setEnabled(!enabled);
        if(stop!=null)stop.setEnabled(enabled);
        updateBackgroundState();
        if(enabled&&!healthy)maybeRecoverService(false);
        h.postDelayed(this,1000);
    }};

    private LinearLayout card(){LinearLayout l=new LinearLayout(this);l.setOrientation(LinearLayout.VERTICAL);l.setBackground(round(Color.WHITE,16,line));LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.setMargins(0,0,0,dp(4));l.setLayoutParams(lp);l.setElevation(dp(1));return l;}
    private void section(LinearLayout root,String s){TextView v=text(s,12,true,burgundy);v.setLetterSpacing(.08f);v.setPadding(0,dp(18),0,dp(8));root.addView(v);}
    private TextView label(String s){TextView v=text(s,12,true,Color.DKGRAY);v.setPadding(0,dp(6),0,dp(4));return v;}
    private EditText field(String hint,String value){EditText e=new EditText(this);e.setHint(hint);e.setText(value);e.setSingleLine(true);e.setTextSize(16);e.setTextColor(ink);e.setPadding(dp(12),dp(8),dp(12),dp(8));e.setBackground(round(Color.rgb(250,249,247),10,line));return e;}
    private Button smallButton(String s){Button b=secondaryButton(s);b.setTextSize(11);LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(0,dp(48),1);lp.setMargins(dp(3),0,dp(3),0);b.setLayoutParams(lp);return b;}
    private Button primaryButton(String s){Button b=new Button(this);b.setText(s);b.setTextColor(Color.WHITE);b.setTextSize(16);b.setTypeface(null,Typeface.BOLD);b.setAllCaps(false);b.setBackground(round(burgundy,14,burgundy));LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,dp(58));lp.setMargins(0,dp(22),0,0);b.setLayoutParams(lp);return b;}
    private Button secondaryButton(String s){Button b=new Button(this);b.setText(s);b.setTextColor(ink);b.setTextSize(14);b.setTypeface(null,Typeface.BOLD);b.setAllCaps(false);b.setBackground(round(Color.WHITE,12,line));b.setLayoutParams(new LinearLayout.LayoutParams(-1,dp(52)));return b;}
    private TextView text(String s,int size,boolean bold,int color){TextView v=new TextView(this);v.setText(s);v.setTextSize(size);v.setTextColor(color);if(bold)v.setTypeface(null,Typeface.BOLD);return v;}
    private GradientDrawable round(int fill,int radius,int stroke){GradientDrawable g=new GradientDrawable();g.setColor(fill);g.setCornerRadius(dp(radius));g.setStroke(dp(1),stroke);return g;}
    private int dp(int n){return(int)(n*getResources().getDisplayMetrics().density+.5f);}
    private void toast(String s){Toast.makeText(this,s,Toast.LENGTH_LONG).show();}

    @Override protected void onDestroy(){h.removeCallbacks(refresh);super.onDestroy();}
}
