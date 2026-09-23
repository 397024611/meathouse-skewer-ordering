package au.com.meathouseskewer.bridge;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

public class WatchdogReceiver extends BroadcastReceiver {
    public static final String ACTION_WATCHDOG="au.com.meathouseskewer.bridge.WATCHDOG";
    private static final long WATCHDOG_DELAY_MS=120000L;
    private static final long REARM_THRESHOLD_MS=60000L;

    @Override public void onReceive(Context context,Intent intent){
        if(intent==null||!ACTION_WATCHDOG.equals(intent.getAction()))return;
        SharedPreferences p=context.getSharedPreferences(BridgeConfig.PREFS,Context.MODE_PRIVATE);
        if(!p.getBoolean("enabled",false))return;
        p.edit()
                .putInt("watchdog_fire_count",p.getInt("watchdog_fire_count",0)+1)
                .putLong("last_watchdog_at",System.currentTimeMillis())
                .putLong("watchdog_due_at",0L)
                .apply();
        try{
            Intent service=new Intent(context,BridgeService.class);
            if(Build.VERSION.SDK_INT>=26)context.startForegroundService(service);
            else context.startService(service);
        }catch(Throwable ignored){}
        forceSchedule(context,WATCHDOG_DELAY_MS);
    }

    public static void arm(Context context){
        Context app=context.getApplicationContext();
        SharedPreferences p=app.getSharedPreferences(BridgeConfig.PREFS,Context.MODE_PRIVATE);
        if(!p.getBoolean("enabled",false))return;
        long now=System.currentTimeMillis();
        long due=p.getLong("watchdog_due_at",0L);
        if(due>now+REARM_THRESHOLD_MS)return;
        scheduleAt(app,now+WATCHDOG_DELAY_MS);
    }

    public static void forceSchedule(Context context,long delayMs){
        scheduleAt(context.getApplicationContext(),System.currentTimeMillis()+Math.max(1000L,delayMs));
    }

    public static boolean exactAlarmAllowed(Context context){
        if(Build.VERSION.SDK_INT<31)return true;
        try{
            AlarmManager am=(AlarmManager)context.getSystemService(Context.ALARM_SERVICE);
            return am!=null&&am.canScheduleExactAlarms();
        }catch(Throwable ignored){return false;}
    }

    public static void cancel(Context context){
        try{
            AlarmManager am=(AlarmManager)context.getSystemService(Context.ALARM_SERVICE);
            if(am!=null)am.cancel(pending(context));
        }catch(Throwable ignored){}
        context.getSharedPreferences(BridgeConfig.PREFS,Context.MODE_PRIVATE).edit().putLong("watchdog_due_at",0L).apply();
    }

    private static void scheduleAt(Context context,long when){
        try{
            AlarmManager am=(AlarmManager)context.getSystemService(Context.ALARM_SERVICE);
            if(am==null)return;
            PendingIntent pi=pending(context);
            if(Build.VERSION.SDK_INT>=31&&am.canScheduleExactAlarms()){
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,when,pi);
            }else if(Build.VERSION.SDK_INT>=23){
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,when,pi);
            }else{
                am.set(AlarmManager.RTC_WAKEUP,when,pi);
            }
            context.getSharedPreferences(BridgeConfig.PREFS,Context.MODE_PRIVATE).edit().putLong("watchdog_due_at",when).apply();
        }catch(Throwable ignored){}
    }

    private static PendingIntent pending(Context context){
        Intent i=new Intent(context,WatchdogReceiver.class).setAction(ACTION_WATCHDOG);
        return PendingIntent.getBroadcast(context,2002,i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    }
}
