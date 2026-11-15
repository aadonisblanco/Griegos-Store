(function () {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const references = sources => `<ul class="ody-sources">${sources.map(s=>`<li><a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">${escape(s.title)}</a></li>`).join('')}</ul>`;
  window.ODY = {escape,references};
  const year=document.querySelector('#ody-year'); if(year)year.textContent=String(new Date().getFullYear());
  document.addEventListener('click',event=>{if(event.target.closest('[data-print]'))window.print();});
})();
