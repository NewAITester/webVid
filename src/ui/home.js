/** صفحهٔ کتابخانه: شبکهٔ پروژه‌ها + کشو + ناوبری پایین. */
const $ = s => document.querySelector(s);

export function renderHome(store, onOpen) {
  const grid = $('#projGrid');
  grid.innerHTML = '';
  const add = document.createElement('button');
  add.className = 'pcard add'; add.id = 'newProj';
  add.innerHTML = '<span class="addplus">+</span><span class="addlbl">پروژهٔ تازه</span>';
  add.onclick = () => {
    const p = store.createProject('پروژهٔ تازه');
    onOpen(p.id);
  };
  grid.appendChild(add);
  for (const p of store.projects) {
    const card = document.createElement('div');
    card.className = 'pcard';
    card.innerHTML = `<div class="pi">▶</div><div class="pm"><div class="pt">${p.name}</div><div class="ps">${p.width}×${p.height} · ${p.layers.length} لایه</div></div><button class="px" title="حذف">✕</button>`;
    card.onclick = () => onOpen(p.id);
    card.querySelector('.px').onclick = e => { e.stopPropagation(); store.deleteProject(p.id); };
    grid.appendChild(card);
  }
}

export function wireHome(store, onOpen) {
  renderHome(store, onOpen);
  store.subscribe(() => { if (document.querySelector('#app').dataset.screen === 'library') renderHome(store, onOpen); });
  $('#menuBtn').onclick = () => { $('#drawer').classList.add('open'); $('#drawerBg').classList.remove('hidden'); };
  const close = () => { $('#drawer').classList.remove('open'); $('#drawerBg').classList.add('hidden'); };
  $('#drawerBg').onclick = close;
  $('#drClose').onclick = close;
  $('#libNew').onclick = () => { const p = store.createProject('پروژهٔ تازه'); onOpen(p.id); };
  $('#libHome').onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  const goLearn = () => { close(); $('#app').dataset.screen = 'learn'; };
  $('#libLearn').onclick = goLearn;
  $('#learnBtn').onclick = goLearn;
  $('#drLearn').onclick = goLearn;
  $('#drImport').onclick = close;
  $('#drCode').onclick = close;
  $('#drReel').onclick = close;
  $('#learnBack').onclick = () => { $('#app').dataset.screen = 'library'; };
}
