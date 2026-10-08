import { chromium } from 'playwright';
const b = await chromium.launch({ args:['--no-sandbox'] });
const pg = await b.newPage({ viewport:{width:412,height:915}, isMobile:true, hasTouch:true, deviceScaleFactor:2 });
await pg.goto('http://localhost:5173/',{waitUntil:'networkidle'});
await pg.waitForFunction(()=>document.querySelector('#loading')?.classList.contains('gone'),{timeout:30000});
await pg.click('.pcard'); await pg.waitForTimeout(900);
await pg.evaluate(()=>window.__studio.seek(0));          // جایی بدون شعر
await pg.click('#nav button[data-go="fx"]'); await pg.waitForTimeout(1200);
// آیا کارت‌ها محتوا دارند؟
const filled = await pg.evaluate(()=>{
  let n=0;
  for (const c of document.querySelectorAll('.fxcard canvas')) {
    const g=c.getContext('2d'); const d=g.getImageData(0,0,c.width,c.height).data;
    let bright=0; for(let i=0;i<d.length;i+=40) if(d[i]>60) bright++;
    if (bright>5) n++;
  }
  return n;
});
console.log(`کارت‌های دارای محتوا: ${filled} از ${await pg.evaluate(()=>document.querySelectorAll('.fxcard').length)}`);
await pg.screenshot({path:'tests/g1.png'});
await pg.click('#fxCats .chip:nth-child(3)'); await pg.waitForTimeout(1200);
await pg.screenshot({path:'tests/g2.png'});
await b.close();
