package com.cps.player;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;

/**
 * 前台服务保活（TC-08）：常驻通知栏，承载 WebView 播放进程，
 * 降低被系统回收概率；配合 BootReceiver 实现开机自启。
 */
public class PlayerForegroundService extends Service {
    private static final String CHANNEL_ID = "cps_player";
    private static final int NOTI_ID = 1001;

    @Override
    public void onCreate() {
        super.onCreate();
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null && nm.getNotificationChannel(CHANNEL_ID) == null) {
            nm.createNotificationChannel(
                new NotificationChannel(CHANNEL_ID, "内容发布终端", NotificationManager.IMPORTANCE_LOW));
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("内容发布终端运行中")
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setOngoing(true)
            .build();
        startForeground(NOTI_ID, notification);

        // 拉起 Capacitor 主界面（已在前台则不重复）
        Intent ui = new Intent(this, MainActivity.class);
        ui.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(ui);
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
