(function () {
  const pageByView = {
    home: 'index.html',
    cert: 'certificate.html',
    mailer: 'mailer.html',
    projects: 'projects.html',
    settings: 'settings.html',
    profile: 'profile.html',
    sync: 'data-sync.html',
    verify: 'verify.html'
  };

  function initialView() {
    return document.body.getAttribute('data-initial-view') || 'home';
  }

  function openInitialView() {
    const view = initialView();
    if (typeof goView === 'function' && view !== 'verify') {
      goView(view);
    }
    if (view === 'verify' && typeof openVerifyModal === 'function') {
      if (typeof goView === 'function') goView('cert');
      setTimeout(openVerifyModal, 120);
    }
  }

  window.addEventListener('load', function () {
    setTimeout(openInitialView, 180);
  });

  window.NOVA_PAGES = pageByView;
})();

/* ── NOVA Smooth View Transitions ── */
(function () {
  /* Patch goView after app.js loads it */
  window.addEventListener('load', function () {
    setTimeout(function () {
      if (typeof goView !== 'function') return;
      var _orig = goView;

      window.goView = function (v) {
        /* Find currently active view and fade it out first */
        var current = document.querySelector('.view.active');
        if (current && !current.id.includes(v[0].toUpperCase() + v.slice(1))) {
          current.style.transition = 'opacity 0.18s ease, transform 0.18s ease';
          current.style.opacity = '0';
          current.style.transform = 'translateY(-6px) scale(0.99)';
          setTimeout(function () {
            current.style.transition = '';
            current.style.opacity = '';
            current.style.transform = '';
            _orig(v);
          }, 170);
        } else {
          _orig(v);
        }
      };

      /* Sidebar click ripple */
      document.querySelectorAll('.sb-i').forEach(function (el) {
        el.addEventListener('click', function (e) {
          var ripple = document.createElement('span');
          ripple.style.cssText = [
            'position:absolute', 'border-radius:50%', 'pointer-events:none',
            'width:60px', 'height:60px', 'background:rgba(255,255,255,0.25)',
            'transform:scale(0)', 'animation:glassRipple 0.55s ease forwards',
            'left:' + (e.offsetX - 30) + 'px', 'top:' + (e.offsetY - 30) + 'px',
            'z-index:0'
          ].join(';');
          el.style.position = 'relative';
          el.style.overflow = 'hidden';
          el.appendChild(ripple);
          setTimeout(function () { ripple.remove(); }, 600);
        });
      });

      /* Button click ripple — every .btn, .bl, .bd */
      document.querySelectorAll('.btn, .bl, .bd, .ml-btn-primary, .ml-btn-success, .vfy-run-btn').forEach(function (el) {
        el.addEventListener('click', function (e) {
          var r = el.getBoundingClientRect();
          var ripple = document.createElement('span');
          ripple.style.cssText = [
            'position:absolute', 'border-radius:50%', 'pointer-events:none',
            'width:80px', 'height:80px', 'background:rgba(255,255,255,0.20)',
            'transform:scale(0)', 'animation:glassRipple 0.50s ease forwards',
            'left:' + (e.clientX - r.left - 40) + 'px',
            'top:'  + (e.clientY - r.top  - 40) + 'px',
            'z-index:0'
          ].join(';');
          el.style.position = 'relative';
          el.style.overflow = 'hidden';
          el.appendChild(ripple);
          setTimeout(function () { ripple.remove(); }, 550);
        });
      });

    }, 600);
  });
})();
