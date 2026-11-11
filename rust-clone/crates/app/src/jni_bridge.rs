//! Android JNI bridge (Android only; host builds use stubs in `export.rs`
//! and the media UI, which stay disabled off-device).
//!
//! Why JNI and not SAF: android-activity 0.6 forwards no activity-result
//! callback, so `startActivityForResult` (the SAF picker) can never return
//! a URI to us. The working route is MediaStore queries through the
//! `ContentResolver` — state queries, no result callback needed. Permission
//! requests are the same: `requestPermissions` + poll `checkSelfPermission`
//! on the next picker open (the system dialog's answer is observable as
//! state, not as an event).
//!
//! Everything here is a plain function over `&AndroidApp` so the UI can
//! call it without storing JNI state. `MediaPlayer` is the exception: it
//! keeps a global ref to the Java player plus the `JavaVM` so any thread
//! can attach and call it.

#[cfg(target_os = "android")]
use android_activity::AndroidApp;
#[cfg(target_os = "android")]
use jni::{
    objects::{GlobalRef, JObject, JString, JValue},
    sys, JNIEnv, JavaVM,
};
#[cfg(target_os = "android")]
use std::sync::Mutex;

#[derive(Clone, Debug)]
pub struct MediaItem {
    /// content:// URI string (stable across reboots; stored in projects).
    pub uri: String,
    pub name: String,
    pub mime: String,
    /// bytes; -1 when the column is missing
    pub size: i64,
    /// milliseconds; 0 for images
    pub duration_ms: i64,
    /// seconds since epoch
    pub date_added: i64,
}

#[derive(Clone, Copy, PartialEq)]
pub enum MediaKind {
    Images,
    Videos,
    Audio,
}

impl MediaKind {
    #[allow(dead_code)] // used only by the Android-only MediaStore listing
    fn content_uri(&self) -> &'static str {
        match self {
            MediaKind::Images => "content://media/external/images/media",
            MediaKind::Videos => "content://media/external/video/media",
            MediaKind::Audio => "content://media/external/audio/media",
        }
    }

    /// Runtime permission for this kind (API 33+ splits media permissions).
    pub fn permission(&self, sdk: i32) -> &'static str {
        if sdk >= 33 {
            match self {
                MediaKind::Images => "android.permission.READ_MEDIA_IMAGES",
                MediaKind::Videos => "android.permission.READ_MEDIA_VIDEO",
                MediaKind::Audio => "android.permission.READ_MEDIA_AUDIO",
            }
        } else {
            "android.permission.READ_EXTERNAL_STORAGE"
        }
    }
}

#[cfg(target_os = "android")]
fn vm(app: &AndroidApp) -> Result<JavaVM, String> {
    // SAFETY: vm_as_ptr is the process JavaVM, valid for the app lifetime.
    unsafe { JavaVM::from_raw(app.vm_as_ptr() as *mut sys::JavaVM) }
        .map_err(|e| format!("JavaVM: {e}"))
}

#[cfg(target_os = "android")]
fn activity(app: &AndroidApp) -> JObject<'static> {
    // SAFETY: activity_as_ptr is the NativeActivity's clazz (a jobject),
    // valid for the process lifetime.
    unsafe { JObject::from_raw(app.activity_as_ptr() as *mut sys::_jobject) }
}

#[cfg(target_os = "android")]
fn jstr<'a>(env: &mut JNIEnv<'a>, s: &str) -> Result<JString<'a>, String> {
    env.new_string(s).map_err(|e| format!("new_string: {e}"))
}

#[cfg(target_os = "android")]
fn get_string(env: &mut JNIEnv, obj: JObject) -> Result<String, String> {
    let js = JString::from(obj);
    env.get_string(&js)
        .map(|s| s.into())
        .map_err(|e| format!("get_string: {e}"))
}

#[cfg(target_os = "android")]
fn call<'a, 'b>(
    env: &mut JNIEnv<'a>,
    obj: &JObject<'b>,
    name: &str,
    sig: &str,
    args: &[JValue],
) -> Result<jni::objects::JValueOwned<'a>, String> {
    env.call_method(obj, name, sig, args)
        .map_err(|e| format!("{name}: {e}"))
}

/// `android.os.Build$VERSION.SDK_INT`.
#[cfg(target_os = "android")]
pub fn sdk_int(app: &AndroidApp) -> Result<i32, String> {
    let vm = vm(app)?;
    let mut guard = vm.attach_current_thread().map_err(|e| e.to_string())?;
    let env: &mut JNIEnv = &mut guard;
    let cls = env
        .find_class("android/os/Build$VERSION")
        .map_err(|e| e.to_string())?;
    let v = env
        .get_static_field(&cls, "SDK_INT", "I")
        .map_err(|e| e.to_string())?;
    Ok(v.i().map_err(|e| e.to_string())?)
}

/// `Context.checkSelfPermission` — 0 = granted.
#[cfg(target_os = "android")]
pub fn has_permission(app: &AndroidApp, perm: &str) -> Result<bool, String> {
    let vm = vm(app)?;
    let mut guard = vm.attach_current_thread().map_err(|e| e.to_string())?;
    let env: &mut JNIEnv = &mut guard;
    let act = activity(app);
    let p = jstr(env, perm)?;
    let r = call(
        env,
        &act,
        "checkSelfPermission",
        "(Ljava/lang/String;)I",
        &[JValue::Object(&p.into())],
    )?;
    Ok(r.i().map_err(|e| e.to_string())? == 0)
}

/// `Activity.requestPermissions` — the system dialog appears; the answer
/// is observable later via `has_permission` (poll, no callback needed).
#[cfg(target_os = "android")]
pub fn request_permission(app: &AndroidApp, perm: &str) -> Result<(), String> {
    let vm = vm(app)?;
    let mut guard = vm.attach_current_thread().map_err(|e| e.to_string())?;
    let env: &mut JNIEnv = &mut guard;
    let act = activity(app);
    let str_cls = env
        .find_class("java/lang/String")
        .map_err(|e| e.to_string())?;
    let arr = env
        .new_object_array(1, &str_cls, JObject::null())
        .map_err(|e| e.to_string())?;
    let p = jstr(env, perm)?;
    env.set_object_array_element(&arr, 0, &p)
        .map_err(|e| e.to_string())?;
    call(
        env,
        &act,
        "requestPermissions",
        "([Ljava/lang/String;I)V",
        &[JValue::Object(&arr.into()), JValue::Int(1)],
    )?;
    Ok(())
}

#[cfg(target_os = "android")]
fn uri_parse<'a>(env: &mut JNIEnv<'a>, uri: &str) -> Result<JObject<'a>, String> {
    let cls = env
        .find_class("android/net/Uri")
        .map_err(|e| e.to_string())?;
    let s = jstr(env, uri)?;
    let r = env
        .call_static_method(
            &cls,
            "parse",
            "(Ljava/lang/String;)Landroid/net/Uri;",
            &[JValue::Object(&s.into())],
        )
        .map_err(|e| format!("Uri.parse: {e}"))?;
    Ok(r.l().map_err(|e| e.to_string())?)
}

#[cfg(target_os = "android")]
fn content_resolver<'a>(
    env: &mut JNIEnv<'a>,
    app: &AndroidApp,
) -> Result<JObject<'a>, String> {
    let act = activity(app);
    let r = call(
        env,
        &act,
        "getContentResolver",
        "()Landroid/content/ContentResolver;",
        &[],
    )?;
    Ok(r.l().map_err(|e| e.to_string())?)
}

/// MediaStore listing, newest first (max 300). No thumbnails — the list
/// shows name/size/duration; the bytes are read on selection.
#[cfg(target_os = "android")]
pub fn list_media(app: &AndroidApp, kind: MediaKind) -> Result<Vec<MediaItem>, String> {
    let vm = vm(app)?;
    let mut guard = vm.attach_current_thread().map_err(|e| e.to_string())?;
    let env: &mut JNIEnv = &mut guard;
    let cr = content_resolver(env, app)?;
    let uri = uri_parse(env, kind.content_uri())?;
    let sort = jstr(env, "date_added DESC")?;
    let null = JObject::null();
    let cursor = call(
        env,
        &cr,
        "query",
        "(Landroid/net/Uri;[Ljava/lang/String;Ljava/lang/String;[Ljava/lang/String;Ljava/lang/String;)Landroid/database/Cursor;",
        &[
            JValue::Object(&uri),
            JValue::Object(&null),
            JValue::Object(&null),
            JValue::Object(&null),
            JValue::Object(&sort.into()),
        ],
    )?
    .l()
    .map_err(|e| e.to_string())?;
    if cursor.is_null() {
        return Ok(vec![]);
    }
    let mut col = |name: &str| -> Result<i32, String> {
        let s = jstr(env, name)?;
        let r = call(
            env,
            &cursor,
            "getColumnIndex",
            "(Ljava/lang/String;)I",
            &[JValue::Object(&s.into())],
        )?;
        r.i().map_err(|e| e.to_string())
    };
    let c_id = col("_id")?;
    let c_name = col("display_name")?;
    let c_mime = col("mime_type")?;
    let c_size = col("size")?;
    let c_date = col("date_added")?;
    let c_dur = if kind == MediaKind::Images {
        -1
    } else {
        col("duration").unwrap_or(-1)
    };
    let mut out = Vec::new();
    let base = kind.content_uri();
    while {
        let r = call(env, &cursor, "moveToNext", "()Z", &[])?;
        r.z().map_err(|e| e.to_string())?
    } {
        let id = call(env, &cursor, "getLong", "(I)J", &[JValue::Int(c_id)])?
            .j()
            .map_err(|e| e.to_string())?;
        let name = if c_name >= 0 {
            let o = call(
                env,
                &cursor,
                "getString",
                "(I)Ljava/lang/String;",
                &[JValue::Int(c_name)],
            )?
            .l()
            .map_err(|e| e.to_string())?;
            if o.is_null() {
                String::new()
            } else {
                get_string(env, o)?
            }
        } else {
            String::new()
        };
        let mime = if c_mime >= 0 {
            let o = call(
                env,
                &cursor,
                "getString",
                "(I)Ljava/lang/String;",
                &[JValue::Int(c_mime)],
            )?
            .l()
            .map_err(|e| e.to_string())?;
            if o.is_null() {
                String::new()
            } else {
                get_string(env, o)?
            }
        } else {
            String::new()
        };
        let size = if c_size >= 0 {
            call(env, &cursor, "getLong", "(I)J", &[JValue::Int(c_size)])?
                .j()
                .map_err(|e| e.to_string())?
        } else {
            -1
        };
        let date_added = if c_date >= 0 {
            call(env, &cursor, "getLong", "(I)J", &[JValue::Int(c_date)])?
                .j()
                .map_err(|e| e.to_string())?
        } else {
            0
        };
        let duration_ms = if c_dur >= 0 {
            call(env, &cursor, "getLong", "(I)J", &[JValue::Int(c_dur)])?
                .j()
                .map_err(|e| e.to_string())?
        } else {
            0
        };
        out.push(MediaItem {
            uri: format!("{base}/{id}"),
            name,
            mime,
            size,
            duration_ms,
            date_added,
        });
        if out.len() >= 300 {
            break;
        }
    }
    // Cursor.close() — best effort.
    let _ = call(env, &cursor, "close", "()V", &[]);
    Ok(out)
}

/// Read a whole content:// URI through the ContentResolver.
#[cfg(target_os = "android")]
pub fn read_uri(app: &AndroidApp, uri: &str) -> Result<Vec<u8>, String> {
    let vm = vm(app)?;
    let mut guard = vm.attach_current_thread().map_err(|e| e.to_string())?;
    let env: &mut JNIEnv = &mut guard;
    let cr = content_resolver(env, app)?;
    let u = uri_parse(env, uri)?;
    let stream = call(
        env,
        &cr,
        "openInputStream",
        "(Landroid/net/Uri;)Ljava/io/InputStream;",
        &[JValue::Object(&u)],
    )?
    .l()
    .map_err(|e| format!("openInputStream: {e}"))?;
    if stream.is_null() {
        return Err("openInputStream returned null".to_string());
    }
    let buf_arr = env.new_byte_array(8192).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    loop {
        let n = call(
            env,
            &stream,
            "read",
            "([B)I",
            &[JValue::Object(buf_arr.as_ref())],
        )?
        .i()
        .map_err(|e| e.to_string())?;
        if n <= 0 {
            break;
        }
        // jbyte is i8; convert on the way out.
        let mut chunk = vec![0i8; n as usize];
        env.get_byte_array_region(&buf_arr, 0, &mut chunk)
            .map_err(|e| e.to_string())?;
        out.extend(chunk.iter().map(|b| *b as u8));
    }
    let _ = call(env, &stream, "close", "()V", &[]);
    Ok(out)
}

/// `Activity.getExternalFilesDir(null)` — the app's files dir on shared
/// storage (visible to the user in a file manager), for MP4 output.
#[cfg(target_os = "android")]
pub fn external_files_dir(app: &AndroidApp) -> Result<String, String> {
    let vm = vm(app)?;
    let mut guard = vm.attach_current_thread().map_err(|e| e.to_string())?;
    let env: &mut JNIEnv = &mut guard;
    let act = activity(app);
    let null = JObject::null();
    let file = call(
        env,
        &act,
        "getExternalFilesDir",
        "(Ljava/lang/String;)Ljava/io/File;",
        &[JValue::Object(&null)],
    )?
    .l()
    .map_err(|e| format!("getExternalFilesDir: {e}"))?;
    if file.is_null() {
        return Err("no external files dir".to_string());
    }
    let path = call(
        env,
        &file,
        "getAbsolutePath",
        "()Ljava/lang/String;",
        &[],
    )?
    .l()
    .map_err(|e| e.to_string())?;
    get_string(env, path)
}

/// A Java `android.media.MediaPlayer` for audio preview. The player object
/// is a global ref; the `JavaVM` lets any thread attach and call it.
#[cfg(target_os = "android")]
pub struct AudioPlayer {
    vm: JavaVM,
    player: GlobalRef,
    src: String,
    playing: Mutex<bool>,
}

#[cfg(target_os = "android")]
impl AudioPlayer {
    /// Create + `setDataSource(context, uri)` + `prepare()` (blocking;
    /// local files prepare fast). Any error releases the player.
    pub fn open(app: &AndroidApp, uri: &str) -> Result<Self, String> {
        let vm = vm(app)?;
        let mut guard = vm.attach_current_thread().map_err(|e| e.to_string())?;
        let env: &mut JNIEnv = &mut guard;
        let cls = env
            .find_class("android/media/MediaPlayer")
            .map_err(|e| e.to_string())?;
        let obj = env
            .new_object(&cls, "()V", &[])
            .map_err(|e| format!("MediaPlayer new: {e}"))?;
        let act = activity(app);
        let u = uri_parse(env, uri)?;
        let r = call(
            env,
            &obj,
            "setDataSource",
            "(Landroid/content/Context;Landroid/net/Uri;)V",
            &[JValue::Object(&act), JValue::Object(&u)],
        );
        if let Err(e) = r {
            let _ = call(env, &obj, "release", "()V", &[]);
            return Err(format!("setDataSource: {e}"));
        }
        if let Err(e) = call(env, &obj, "prepare", "()V", &[]) {
            let _ = call(env, &obj, "release", "()V", &[]);
            return Err(format!("prepare: {e}"));
        }
        let player = env
            .new_global_ref(&obj)
            .map_err(|e| e.to_string())?;
        // The attach guard borrows `vm`; drop it before moving `vm` into
        // the player (the global ref does not borrow the env).
        drop(guard);
        Ok(Self {
            vm,
            player,
            src: uri.to_string(),
            playing: Mutex::new(false),
        })
    }

    pub fn src(&self) -> &str {
        &self.src
    }

    fn with_env<T, F: FnOnce(&mut JNIEnv, &JObject) -> Result<T, String>>(
        &self,
        f: F,
    ) -> Result<T, String> {
        let mut guard = self
            .vm
            .attach_current_thread()
            .map_err(|e| e.to_string())?;
        let env: &mut JNIEnv = &mut guard;
        let obj = self.player.as_obj();
        f(env, obj)
    }

    pub fn start(&self) -> Result<(), String> {
        self.with_env(|env, obj| {
            call(env, &obj, "start", "()V", &[])?;
            Ok(())
        })?;
        *self.playing.lock().unwrap() = true;
        Ok(())
    }

    pub fn pause(&self) -> Result<(), String> {
        self.with_env(|env, obj| {
            call(env, &obj, "pause", "()V", &[])?;
            Ok(())
        })?;
        *self.playing.lock().unwrap() = false;
        Ok(())
    }

    pub fn is_playing(&self) -> bool {
        *self.playing.lock().unwrap()
    }

    /// Current position in seconds (0 on error).
    pub fn position_secs(&self) -> f64 {
        match self.with_env(|env, obj| {
            let r = call(env, &obj, "getCurrentPosition", "()I", &[])?;
            Ok(r.i().map_err(|e| e.to_string())? as f64 / 1000.0)
        }) {
            Ok(v) => v,
            Err(_) => 0.0,
        }
    }

    pub fn release(&self) {
        let _ = self.with_env(|env, obj| {
            let _ = call(env, &obj, "stop", "()V", &[]);
            call(env, &obj, "release", "()V", &[])?;
            Ok(())
        });
    }
}
