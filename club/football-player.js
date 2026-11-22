/* Direct HLS playback for the club's shared football video. No stream is loaded before a click. */
(function (root) {
  'use strict';
  const HLS_SRC = 'vendor/hls-1.7.4.min.js';
  const HLS_INTEGRITY = 'sha384-p9vgU/7IYJWd3I4STrtqxqR/2cAQlhIX7D/HrTnIMEjjcUox165b7se7sxmm3zDg';
  let libraryPromise = null;

  function sourceUrl(raw) {
    if (typeof raw !== 'string' || !raw || raw.length > 2000) return null;
    try {
      const u = new URL(raw);
      const host = u.hostname.toLowerCase();
      if (u.protocol !== 'https:' || u.username || u.password || !/\.m3u8$/i.test(u.pathname)) return null;
      if (!host.includes('.') || host.startsWith('[') || /^(?:\d+\.){3}\d+$/.test(host) || /\.(?:localhost|local|internal)$/.test(host)) return null;
      if (host === 'nv-fconline.github.io' || host === 'nv-api.e2jinsoopark.workers.dev') return null;
      return u.href;
    } catch { return null; }
  }
  function isHlsSource(v) {
    return !!v && v.provider === 'web' && v.kind === 'page' && !!sourceUrl(v.id);
  }
  function usableLibrary(Hls) { return typeof Hls === 'function' && typeof Hls.isSupported === 'function'; }
  function loadLibrary() {
    if (usableLibrary(root.Hls)) return Promise.resolve(root.Hls);
    if (libraryPromise) return libraryPromise;
    const promise = new Promise((resolve, reject) => {
      const script = root.document.createElement('script');
      let ended = false;
      const settle = (error) => {
        if (ended) return;
        ended = true;
        root.clearTimeout(timer);
        script.onload = script.onerror = null;
        if (error) { script.remove(); reject(error); }
        else resolve(root.Hls);
      };
      const timer = root.setTimeout(() => settle(new Error('hls_library_timeout')), 10000);
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.integrity = HLS_INTEGRITY;
      script.onload = () => settle(usableLibrary(root.Hls) ? null : new Error('hls_library_invalid'));
      script.onerror = () => settle(new Error('hls_library_failed'));
      script.src = HLS_SRC;
      try { (root.document.head || root.document.body || root.document.documentElement).append(script); }
      catch { settle(new Error('hls_library_failed')); }
    });
    libraryPromise = promise;
    promise.catch(() => { if (libraryPromise === promise) libraryPromise = null; });
    return promise;
  }

  function create(options) {
    const url = sourceUrl(options && options.url);
    if (!url) throw new TypeError('Invalid HLS source');
    const doc = root.document;
    const element = doc.createElement('div'); element.className = 'fb-hls-player';
    const video = doc.createElement('video'); video.className = 'fb-hls-video';
    video.controls = true; video.preload = 'none'; video.playsInline = true;
    video.setAttribute('playsinline', ''); video.setAttribute('crossorigin', 'anonymous');
    video.crossOrigin = 'anonymous';
    video.setAttribute('aria-label', typeof options.title === 'string' && options.title ? options.title : '같이 보기 방송');
    const start = doc.createElement('button'); start.className = 'btn fb-hls-start'; start.type = 'button'; start.textContent = '방송 재생';
    const status = doc.createElement('p'); status.className = 'fb-hls-status'; status.setAttribute('role', 'status');
    const retry = doc.createElement('button'); retry.className = 'btn btn-ghost fb-hls-retry'; retry.type = 'button'; retry.textContent = '다시 연결'; retry.hidden = true;
    element.append(video, start, status, retry);
    let destroyed = false, attempt = 0, hls = null, mode = null, started = false, failed = false, recoveryUsed = false;
    let startupTimer = null;
    const listeners = [];
    const current = (id) => !destroyed && !failed && id === attempt;
    function listen(target, event, fn) { target.addEventListener(event, fn); listeners.push([target, event, fn]); }
    function notify(state, message) {
      if (destroyed) return;
      element.dataset.state = state; status.textContent = message;
      if (typeof options.onStatus === 'function') { try { options.onStatus({ state, message }); } catch {} }
    }
    function clearStartup() { if (startupTimer !== null) root.clearTimeout(startupTimer); startupTimer = null; }
    function cleanEngine() {
      clearStartup();
      const old = hls; hls = null; mode = null;
      if (old) { try { old.destroy(); } catch {} }
      try { video.pause(); } catch {}
      video.removeAttribute('src');
      try { video.load(); } catch {}
    }
    function failure(message, id) {
      if (!current(id) || failed) return;
      failed = true; started = false;
      cleanEngine();
      start.hidden = true; start.disabled = false;
      retry.hidden = false; retry.disabled = false;
      notify('error', message || '방송을 재생하지 못했어요. 연결 상태나 방송 쪽 재생 제한·영상 형식이 원인일 수 있어요.');
    }
    function playCurrent(id) {
      if (!current(id) || failed || !started) return;
      let playing;
      try { playing = video.play(); }
      catch (error) { playing = Promise.reject(error); }
      Promise.resolve(playing).then(() => {
        if (!current(id) || failed || !started) return;
        clearStartup(); start.hidden = true; retry.hidden = true;
        notify('playing', '방송 재생 중');
      }).catch((error) => {
        if (!current(id) || failed) return;
        if (error && (error.name === 'NotAllowedError' || error.name === 'AbortError')) {
          clearStartup(); start.hidden = false; start.disabled = false; start.textContent = '재생하기';
          notify('ready', '재생 준비가 됐어요. 재생 버튼을 한 번 더 눌러 주세요.');
        } else failure(null, id);
      });
    }
    function nativeStart(id) {
      if (!current(id)) return;
      mode = 'native'; video.src = url;
      try { video.load(); } catch {}
      playCurrent(id);
    }
    async function connect() {
      if (destroyed || start.disabled || retry.disabled) return;
      const id = ++attempt;
      started = false; failed = false; recoveryUsed = false;
      cleanEngine();
      started = true; start.hidden = true; start.disabled = true; retry.hidden = true; retry.disabled = true;
      notify('loading', '방송을 연결하고 있어요.');
      startupTimer = root.setTimeout(() => failure('방송 연결이 오래 걸리고 있어요. 잠시 뒤 다시 연결해 주세요.', id), 20000);
      let Hls;
      try { Hls = await (typeof options.loadHls === 'function' ? options.loadHls() : loadLibrary()); }
      catch {
        if (!current(id)) return;
        if (video.canPlayType('application/vnd.apple.mpegurl')) { nativeStart(id); return; }
        failure('재생기를 불러오지 못했어요. 인터넷 연결을 확인하고 다시 연결해 주세요.', id); return;
      }
      if (!current(id)) return;
      let supported = false;
      try { supported = usableLibrary(Hls) && Hls.isSupported(); } catch {}
      if (supported) {
        try {
          const engine = new Hls({ enableWorker: false, debug: false, capLevelToPlayerSize: true, backBufferLength: 30 });
          hls = engine; mode = 'hls';
          engine.on(Hls.Events.MANIFEST_PARSED, () => { if (current(id) && hls === engine && !failed) { clearStartup(); playCurrent(id); } });
          engine.on(Hls.Events.ERROR, (_event, data) => {
            if (!current(id) || hls !== engine || failed || !data || !data.fatal) return;
            if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recoveryUsed) {
              recoveryUsed = true;
              notify('loading', '영상 재생을 한 번 다시 시도하고 있어요.');
              clearStartup();
              startupTimer = root.setTimeout(() => failure(null, id), 10000);
              try { engine.recoverMediaError(); return; } catch {}
            }
            failure(null, id);
          });
          engine.loadSource(url); engine.attachMedia(video);
        } catch {
          const old = hls; hls = null;
          if (old) { try { old.destroy(); } catch {} }
          if (video.canPlayType('application/vnd.apple.mpegurl')) nativeStart(id);
          else failure(null, id);
        }
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) nativeStart(id);
      else failure('이 브라우저에서는 방송 형식을 재생할 수 없어요. 최신 Safari·Chrome·Edge 등으로 다시 열어 주세요.', id);
    }
    listen(start, 'click', () => {
      if (started && !failed && mode) { start.hidden = true; playCurrent(attempt); }
      else connect();
    });
    listen(retry, 'click', connect);
    listen(video, 'playing', () => {
      if (!destroyed && started && !failed) { clearStartup(); start.hidden = true; retry.hidden = true; notify('playing', '방송 재생 중'); }
    });
    listen(video, 'waiting', () => { if (!destroyed && started && !failed) notify('loading', '방송을 버퍼링하고 있어요.'); });
    listen(video, 'error', () => { if (!destroyed && started && !failed && mode === 'native' && video.error) failure(null, attempt); });
    notify('idle', '재생 버튼을 누르면 방송을 연결해요.');
    return {
      element, video,
      destroy() {
        if (destroyed) return;
        destroyed = true; attempt++; started = false;
        for (const [target, event, fn] of listeners) target.removeEventListener(event, fn);
        listeners.length = 0; cleanEngine();
        start.disabled = true; retry.disabled = true; start.hidden = true; retry.hidden = true;
        status.textContent = ''; element.dataset.state = 'destroyed';
      },
    };
  }
  root.NVFootballPlayer = Object.freeze({ isHlsSource, create });
})(globalThis);
