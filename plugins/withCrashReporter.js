/**
 * Плагини Expo: ҳисоботи хатоҳои native-и Android ба сервер (POST /client-errors).
 *
 * Чаро: агар барнома пеш аз оғози JavaScript қатъ шавад, ҳеҷ гуна лог намемонад
 * (Xiaomi «Просмотреть» холӣ буд). Ин handler stack trace-ро:
 *   1) ба файл менависад (filesDir/last_crash.json);
 *   2) ба сервер мефиристад ва то 45 с интизор мешавад (сервери райгон аз «хоб» бедор мешавад);
 *   3) дар оғози навбатӣ, агар фиристода нашуда бошад, аз нав мефиристад.
 * Хатоҳои JavaScript (JavascriptException) ҳам аз ҳамин ҷо мегузаранд.
 */
const { withMainApplication, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const kotlin = (pkg) => `package ${pkg}

import android.content.Context
import android.os.Build
import android.util.Log
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/** Сабти хатоҳои қатъшавии барнома. Ниг. plugins/withCrashReporter.js */
object CrashReporter {
  private const val FILE = "last_crash.json"

  fun install(context: Context, endpoint: String) {
    val file = File(context.filesDir, FILE)
    // Хатои оғози қаблӣ, ки фиристода нашуда буд
    if (file.exists()) {
      val pending = try { file.readText() } catch (_: Throwable) { null }
      if (pending != null) Thread { if (post(endpoint, pending, 30000)) file.delete() }.start()
    }
    val previous = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, error ->
      try {
        val version = try {
          context.packageManager.getPackageInfo(context.packageName, 0).versionName
        } catch (_: Throwable) { "?" }
        val body = JSONObject()
          .put("source", "android-native")
          .put("thread", thread.name)
          .put("message", error.toString().take(2000))
          .put("stack", Log.getStackTraceString(error).take(30000))
          .put("device", Build.MANUFACTURER + " " + Build.MODEL)
          .put("android", Build.VERSION.RELEASE + " (SDK " + Build.VERSION.SDK_INT + ")")
          .put("app", version)
          .toString()
        try { file.writeText(body) } catch (_: Throwable) {}
        val sender = Thread { if (post(endpoint, body, 40000)) file.delete() }
        sender.start()
        sender.join(45000)
      } catch (_: Throwable) {
      }
      previous?.uncaughtException(thread, error)
    }
  }

  private fun post(endpoint: String, body: String, timeoutMs: Int): Boolean = try {
    val c = URL(endpoint).openConnection() as HttpURLConnection
    c.requestMethod = "POST"
    c.connectTimeout = timeoutMs
    c.readTimeout = timeoutMs
    c.doOutput = true
    c.setRequestProperty("content-type", "application/json")
    c.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
    val ok = c.responseCode in 200..299
    c.disconnect()
    ok
  } catch (_: Throwable) {
    false
  }
}
`;

module.exports = function withCrashReporter(config, { endpoint }) {
  const pkg = config.android?.package;
  if (!pkg) throw new Error('withCrashReporter: android.package лозим аст');

  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/java', ...pkg.split('.'));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'CrashReporter.kt'), kotlin(pkg));
      return cfg;
    },
  ]);

  return withMainApplication(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (!src.includes('CrashReporter.install')) {
      const hook = `
  // @tezrason crash-reporter: то ҳарчи барвақттар — пеш аз onCreate ва ContentProvider-ҳо
  override fun attachBaseContext(base: android.content.Context) {
    super.attachBaseContext(base)
    CrashReporter.install(base, ${JSON.stringify(endpoint)})
  }

  override fun onCreate() {`;
      if (!src.includes('override fun onCreate() {')) throw new Error('withCrashReporter: onCreate дар MainApplication ёфт нашуд');
      src = src.replace('  override fun onCreate() {', hook.trimStart().replace(/^/, '  '));
      cfg.modResults.contents = src;
    }
    return cfg;
  });
};
