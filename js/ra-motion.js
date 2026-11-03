/* ====== Movimiento RA (GSAP) — entradas, transiciones y microinteracciones.
   Lo usan survivor-league_new.html (admin) y portal.html. Nada de esto cambia lo que
   se exporta: antes de cada captura las animaciones saltan a su final, y todas limpian
   sus estilos en línea al terminar. ====== */
(function(){
  if (typeof window.gsap === 'undefined') return;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var CLEAR = 'transform,opacity';

  if (typeof window.html2canvas === 'function'){
    var capture = window.html2canvas;
    window.html2canvas = function(){
      gsap.globalTimeline.getChildren(false, true, true).forEach(function(t){ t.progress(1); });
      return capture.apply(this, arguments);
    };
  }

  // Regreso a la portada: una cortina barre la pantalla antes de salir.
  // Delegado, porque el login (js/supa.js) crea sus enlaces después de cargar.
  document.addEventListener('click', function(e){
    var a = e.target.closest('a.back-home, a.back, a.auth-link');
    if (!a || reduce || e.metaKey || e.ctrlKey || e.shiftKey || e.defaultPrevented) return;
    e.preventDefault();
    var c = document.createElement('div');
    c.className = 'ra-curtain';
    document.body.appendChild(c);
    gsap.to(c, {scaleX:1, duration:.45, ease:'power3.inOut', onComplete:function(){ location.href = a.href; }});
  });
  window.addEventListener('pageshow', function(e){
    if (e.persisted) document.querySelectorAll('.ra-curtain').forEach(function(c){ c.remove(); });
  });

  if (reduce) return;

  // Login: la caja entra en cuanto js/supa.js la pone en la página
  function enterGate(gate){
    gsap.fromTo(gate.querySelectorAll('.auth-box > *'), {y:16, opacity:0},
      {y:0, opacity:1, duration:.6, stagger:.06, ease:'expo.out', clearProps:CLEAR});
  }
  document.querySelectorAll('.auth-gate').forEach(enterGate);
  new MutationObserver(function(muts){
    muts.forEach(function(m){ m.addedNodes.forEach(function(n){
      if (n.nodeType === 1 && n.classList.contains('auth-gate')) enterGate(n);
    }); });
  }).observe(document.body, {childList:true});

  // El panel arranca oculto hasta que inicia sesión: la entrada espera a que se muestre
  var wrap = document.querySelector('.wrap');
  function whenShown(fn){
    if (!wrap || !wrap.hidden) return fn();
    var mo = new MutationObserver(function(){ if (!wrap.hidden){ mo.disconnect(); fn(); } });
    mo.observe(wrap, {attributes:true, attributeFilter:['hidden']});
  }
  whenShown(start);

  var CARDS = '.player-card, .pick-card, .logo-tile, .game-card, .team-chip, .team-tile, .pk-row, table.standings tbody tr';

  function start(){
    gsap.timeline({defaults:{ease:'expo.out', duration:.9, clearProps:CLEAR}})
      .from('.wrap .session-bar > *', {x:-24, opacity:0, duration:.6, stagger:.08})
      .from('.hero-brand > *, .portal-hero > div:first-child > *', {x:-30, opacity:0, stagger:.08}, .05)
      .from('.hero h1 > span', {y:40, opacity:0, stagger:.1, duration:1}, .15)
      .from('.save-block, .score-item, .me-box > *', {y:18, opacity:0, stagger:.06, duration:.7}, .25)
      .from('.tabs', {y:14, opacity:0, duration:.6}, .35)
      .from('.tab-content.active .panel', {y:24, opacity:0}, .45);

    // Subrayado lima que se desliza hasta la pestaña activa
    var tabs = document.querySelector('.tabs');
    if (!tabs) return;
    var ink = tabs.querySelector('.ra-tab-ink');
    if (!ink){ ink = document.createElement('span'); ink.className = 'ra-tab-ink'; tabs.insertBefore(ink, tabs.firstChild); }
    tabs.classList.add('has-ink');
    function place(animate){
      var b = tabs.querySelector('.tab-btn.active');
      if (!b) return;
      var box = {x:b.offsetLeft, y:b.offsetTop + b.offsetHeight - 2, width:b.offsetWidth};
      if (animate) gsap.to(ink, Object.assign(box, {duration:.5, ease:'expo.out', overwrite:true}));
      else gsap.set(ink, box);
    }
    place(false);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ place(false); });
    window.addEventListener('resize', function(){ place(false); });

    tabs.addEventListener('click', function(e){
      var b = e.target.closest('.tab-btn');
      if (!b) return;
      place(true);
      var content = document.getElementById('tab-' + b.dataset.tab);
      if (!content) return;
      gsap.fromTo(content.querySelector('.panel'), {y:18, opacity:0}, {y:0, opacity:1, duration:.55, ease:'expo.out', overwrite:true, clearProps:CLEAR});
      var cards = content.querySelectorAll(CARDS);
      if (cards.length) gsap.fromTo(cards, {y:16, opacity:0}, {y:0, opacity:1, duration:.45, stagger:{each:.018, from:'start'}, delay:.06, ease:'power3.out', overwrite:true, clearProps:CLEAR});
    });
  }
})();
