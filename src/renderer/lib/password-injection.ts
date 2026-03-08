export function getDetectionScript(): string {
  return `(function() {
    if (window.__vcPwdObserver) {
      window.__vcPwdObserver.disconnect();
      window.__vcPwdObserver = null;
      window.__vcPwdDetectorActive = false;
    }
    if (window.__vcPwdDetectorActive) return;
    window.__vcPwdDetectorActive = true;

    function findUsernameInput(passwordField) {
      var form = passwordField.closest('form');
      var scope = form || passwordField.parentElement?.parentElement?.parentElement || document;
      var inputs = scope.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"])');
      for (var i = 0; i < inputs.length; i++) {
        var inp = inputs[i];
        if (inp === passwordField) continue;
        var t = (inp.type || '').toLowerCase();
        var n = (inp.name || '').toLowerCase();
        var id = (inp.id || '').toLowerCase();
        var ac = (inp.autocomplete || '').toLowerCase();
        if (t === 'email' || t === 'text' || t === 'tel') {
          if (ac === 'username' || ac === 'email' || n.match(/user|email|login|account/) || id.match(/user|email|login|account/)) {
            return inp;
          }
        }
      }
      for (var j = 0; j < inputs.length; j++) {
        var inp2 = inputs[j];
        if (inp2 !== passwordField && (inp2.type === 'text' || inp2.type === 'email' || inp2.type === 'tel')) {
          return inp2;
        }
      }
      return null;
    }

    function send(type, data) {
      console.log('__VC_PWD__:' + JSON.stringify(Object.assign({ type: type }, data)));
    }

    function handleSubmit(passwordField) {
      var username = findUsernameInput(passwordField);
      var user = username ? username.value : '';
      var pass = passwordField.value;
      if (!pass) return;
      send('form-submit', {
        domain: location.hostname,
        username: user,
        password: pass
      });
    }

    function attachListeners(passwordField) {
      if (passwordField.__vcPwdAttached) return;
      passwordField.__vcPwdAttached = true;

      var form = passwordField.closest('form');
      if (form && !form.__vcPwdAttached) {
        form.__vcPwdAttached = true;
        form.addEventListener('submit', function() {
          handleSubmit(passwordField);
        }, true);
      }

      var scope = form || document;
      var buttons = scope.querySelectorAll('button[type="submit"], input[type="submit"], button:not([type])');
      buttons.forEach(function(btn) {
        if (btn.__vcPwdAttached) return;
        btn.__vcPwdAttached = true;
        btn.addEventListener('click', function() {
          setTimeout(function() { handleSubmit(passwordField); }, 0);
        }, true);
      });
    }

    function scan() {
      var fields = document.querySelectorAll('input[type="password"]');
      fields.forEach(function(f) { attachListeners(f); });
    }

    scan();

    var observer = new MutationObserver(function() { scan(); });
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
    window.__vcPwdObserver = observer;
  })();`;
}

export function getAutoFillScript(username: string, password: string): string {
  const u = JSON.stringify(username)
  const p = JSON.stringify(password)
  return `(function() {
    var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;

    function fill(input, val) {
      setter.call(input, val);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function tryFill() {
      var pwFields = document.querySelectorAll('input[type="password"]');
      if (pwFields.length === 0) return false;

      pwFields.forEach(function(pwField) {
        fill(pwField, ${p});

        var form = pwField.closest('form');
        var scope = form || pwField.parentElement?.parentElement?.parentElement || document;
        var inputs = scope.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="password"])');
        for (var i = 0; i < inputs.length; i++) {
          var inp = inputs[i];
          var t = (inp.type || '').toLowerCase();
          if (t === 'email' || t === 'text' || t === 'tel') {
            fill(inp, ${u});
            break;
          }
        }
      });
      return true;
    }

    if (!tryFill()) {
      var attempts = 0;
      var interval = setInterval(function() {
        attempts++;
        if (tryFill() || attempts > 20) clearInterval(interval);
      }, 500);
    }
  })();`
}
