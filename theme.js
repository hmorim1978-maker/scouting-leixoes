// Applies the theme chosen in this browser before the page paints (avoids a flash of the wrong theme).
try {
  var t = localStorage.getItem('theme');
  if (t === 'dark' || t === 'premium') document.documentElement.setAttribute('data-theme', t);
} catch (e) { /* storage unavailable: light theme */ }
