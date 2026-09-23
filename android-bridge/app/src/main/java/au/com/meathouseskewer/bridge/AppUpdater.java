package au.com.meathouseskewer.bridge;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;

final class AppUpdater {
    private static final String VERSION_URL = "https://meathouseskewer.com.au/bridge-version.json";

    static final class UpdateInfo {
        final long versionCode;
        final String versionName;
        final String apkUrl;
        final String sha256;
        final String notes;

        UpdateInfo(long versionCode, String versionName, String apkUrl, String sha256, String notes) {
            this.versionCode = versionCode;
            this.versionName = versionName;
            this.apkUrl = apkUrl;
            this.sha256 = sha256 == null ? "" : sha256.trim().toLowerCase(Locale.ROOT);
            this.notes = notes == null ? "" : notes.trim();
        }
    }

    interface CheckListener {
        void onUpdateAvailable(UpdateInfo info);
        void onUpToDate(String versionName);
        void onError(String message);
    }

    interface InstallListener {
        void onStatus(String message);
        void onPermissionRequired();
        void onError(String message);
    }

    private AppUpdater() {}

    static String currentVersionName(Context context) {
        try {
            return context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionName;
        } catch (Exception e) {
            return BridgeConfig.APP_VERSION;
        }
    }

    static long currentVersionCode(Context context) {
        try {
            PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            return Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode;
        } catch (Exception e) {
            return 0L;
        }
    }

    static void check(Activity activity, CheckListener listener) {
        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                URL url = new URL(VERSION_URL + "?t=" + System.currentTimeMillis());
                connection = (HttpURLConnection) url.openConnection();
                connection.setConnectTimeout(7000);
                connection.setReadTimeout(10000);
                connection.setUseCaches(false);
                connection.setRequestProperty("Accept", "application/json");
                connection.setRequestProperty("Cache-Control", "no-cache");

                int code = connection.getResponseCode();
                if (code < 200 || code >= 300) throw new Exception("Update server HTTP " + code);

                String body = readAll(connection.getInputStream());
                JSONObject json = new JSONObject(body);
                UpdateInfo info = new UpdateInfo(
                        json.getLong("versionCode"),
                        json.getString("versionName"),
                        json.getString("apkUrl"),
                        json.optString("sha256", ""),
                        json.optString("notes", "")
                );

                long current = currentVersionCode(activity);
                activity.runOnUiThread(() -> {
                    if (info.versionCode > current) listener.onUpdateAvailable(info);
                    else listener.onUpToDate(currentVersionName(activity));
                });
            } catch (Throwable e) {
                String message = shortMsg(e);
                activity.runOnUiThread(() -> listener.onError(message));
            } finally {
                if (connection != null) connection.disconnect();
            }
        }, "bridge-update-check").start();
    }

    static void downloadAndInstall(Activity activity, UpdateInfo info, InstallListener listener) {
        if (Build.VERSION.SDK_INT >= 26 && !activity.getPackageManager().canRequestPackageInstalls()) {
            activity.runOnUiThread(() -> {
                listener.onPermissionRequired();
                Toast.makeText(activity, "Allow 'Install unknown apps', then tap UPDATE NOW again.", Toast.LENGTH_LONG).show();
                try {
                    Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:" + activity.getPackageName()));
                    activity.startActivity(intent);
                } catch (Throwable e) {
                    Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                            Uri.parse("package:" + activity.getPackageName()));
                    activity.startActivity(fallback);
                }
            });
            return;
        }

        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                activity.runOnUiThread(() -> listener.onStatus("Downloading v" + info.versionName + "..."));

                URL url = new URL(info.apkUrl + (info.apkUrl.contains("?") ? "&" : "?") + "t=" + System.currentTimeMillis());
                connection = (HttpURLConnection) url.openConnection();
                connection.setConnectTimeout(10000);
                connection.setReadTimeout(30000);
                connection.setUseCaches(false);

                int code = connection.getResponseCode();
                if (code < 200 || code >= 300) throw new Exception("APK download HTTP " + code);

                File dir = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (dir == null) throw new Exception("Download folder unavailable");
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("Cannot create download folder");

                File part = new File(dir, "MeatHouse-Bridge-update.apk.part");
                File apk = new File(dir, "MeatHouse-Bridge-update.apk");
                if (part.exists()) part.delete();
                if (apk.exists()) apk.delete();

                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                try (InputStream in = connection.getInputStream(); FileOutputStream out = new FileOutputStream(part)) {
                    byte[] buffer = new byte[8192];
                    int n;
                    while ((n = in.read(buffer)) > 0) {
                        out.write(buffer, 0, n);
                        digest.update(buffer, 0, n);
                    }
                    out.flush();
                    out.getFD().sync();
                }

                String actualSha = hex(digest.digest());
                if (!info.sha256.isEmpty() && !actualSha.equalsIgnoreCase(info.sha256)) {
                    part.delete();
                    throw new Exception("Downloaded APK failed SHA-256 verification");
                }

                if (!part.renameTo(apk)) {
                    copyFile(part, apk);
                    part.delete();
                }

                activity.runOnUiThread(() -> {
                    try {
                        listener.onStatus("Download complete · opening installer...");
                        Uri uri = FileProvider.getUriForFile(
                                activity,
                                activity.getPackageName() + ".fileprovider",
                                apk
                        );
                        Intent install = new Intent(Intent.ACTION_VIEW);
                        install.setDataAndType(uri, "application/vnd.android.package-archive");
                        install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        install.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        activity.startActivity(install);
                    } catch (Throwable e) {
                        listener.onError(shortMsg(e));
                    }
                });
            } catch (Throwable e) {
                String message = shortMsg(e);
                activity.runOnUiThread(() -> listener.onError(message));
            } finally {
                if (connection != null) connection.disconnect();
            }
        }, "bridge-update-download").start();
    }

    private static void copyFile(File source, File target) throws Exception {
        try (InputStream in = new java.io.FileInputStream(source);
             FileOutputStream out = new FileOutputStream(target)) {
            byte[] buffer = new byte[8192];
            int n;
            while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
            out.flush();
            out.getFD().sync();
        }
    }

    private static String readAll(InputStream in) throws Exception {
        try (InputStream input = in; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int n;
            while ((n = input.read(buffer)) > 0) out.write(buffer, 0, n);
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private static String hex(byte[] data) {
        StringBuilder b = new StringBuilder(data.length * 2);
        for (byte value : data) b.append(String.format(Locale.ROOT, "%02x", value & 0xff));
        return b.toString();
    }

    private static String shortMsg(Throwable e) {
        String s = e.getMessage();
        if (s == null || s.trim().isEmpty()) s = e.getClass().getSimpleName();
        return s.length() > 160 ? s.substring(0, 160) : s;
    }
}
