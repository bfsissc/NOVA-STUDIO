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
