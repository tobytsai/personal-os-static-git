import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const data=JSON.parse(fs.readFileSync('public/data/gouache/catalog-20261103.json','utf8'));
const pageUrl='/pages/gouache-product-catalog-20261103.html';
test('source rows and images remain intact',async()=>{
 expect(data.length).toBe(232);expect(data.flatMap(p=>p.images).length).toBe(1160);
 expect(data.filter(p=>p.images.every(i=>i.thumb)).length).toBe(220);
 expect(data.flatMap(p=>p.images).filter(i=>i.thumb)).toHaveLength(1100);
 expect(data.flatMap(p=>p.images).filter(i=>i.original)).toHaveLength(1125);
 for(const p of data)for(const i of p.images)if(i.thumb)expect(fs.existsSync('public/'+i.thumb.replace(/^\.\.\//,''))).toBeTruthy();
});
test('filter, favorite, compare, deep link, five photos',async({page})=>{
 await page.goto(pageUrl);await expect(page.locator('#status')).toContainText('232');
 await page.locator('#search').fill('銀珠');await expect(page.locator('#grid .card').first()).toContainText('銀珠');
 await page.locator('#gradeFilter').selectOption('7號');await expect(page.locator('#grid .card')).toHaveCount(1);
 const card=page.locator('#grid .card').first();await card.getByRole('button',{name:/收藏 銀珠/}).click();await page.locator('#favoritesOnly').click();await expect(page.locator('#grid .card')).toHaveCount(1);
 await card.getByRole('button',{name:/比較 銀珠/}).click();await expect(page.locator('#comparison article')).toHaveCount(1);
 await card.getByRole('button',{name:/查看.*五圖/}).click();await expect(page.locator('dialog')).toBeVisible();await expect(page.locator('.gallery figure')).toHaveCount(5);await expect(page.locator('.gallery img')).toHaveCount(5);
 expect(new URL(page.url()).searchParams.get('row')).toBe('84');
 await page.reload();await expect(page.locator('dialog')).toBeVisible();await expect(page.locator('.gallery figure')).toHaveCount(5);
 await page.keyboard.press('Escape');await expect(page.locator('dialog')).not.toBeVisible();
 await expect(page.locator('#search')).toHaveValue('銀珠');await expect(page.locator('#gradeFilter')).toHaveValue('7號');
 await page.locator('#reset').click();await expect(page.locator('#status')).toContainText('232 / 232');
});
test('missing images and mobile overflow',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto(pageUrl+'?row=227');await expect(page.locator('dialog')).toBeVisible();await expect(page.locator('.gallery figure')).toHaveCount(5);await expect(page.locator('.gallery .noimg')).toHaveCount(5);await page.keyboard.press('Escape');await expect(page.locator('#status')).toContainText('232');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
test('same-color compare and five-image navigation',async({page})=>{
 await page.goto(pageUrl+'?row=84');await expect(page.locator('dialog')).toBeVisible();
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'下一張'}).click();await expect(page.locator('.gallery-nav span')).toContainText('2 / 5');
 await page.getByRole('button',{name:'比較同色不同粒度'}).click();await expect(page.locator('#comparison article')).toHaveCount(4);
});

test('keyboard focus and loaded thumbnail',async({page})=>{
 await page.goto(pageUrl+'?q=銀珠&grade=7號');await expect(page.locator('#grid .card')).toHaveCount(1);
 const open=page.locator('#grid .card .open');await open.focus();await page.keyboard.press('Enter');
 await expect(page.locator('dialog')).toBeVisible();
 await expect.poll(()=>page.locator('.gallery img').first().evaluate(i=>i.complete&&i.naturalWidth>0)).toBeTruthy();
 await page.keyboard.press('Escape');await expect(page.locator('dialog')).not.toBeVisible();await expect(open).toBeFocused();
});
test('back button closes product and restores filters',async({page})=>{
 await page.goto(pageUrl+'?q=銀珠&grade=7號');await expect(page.locator('#grid .card')).toHaveCount(1);
 await page.locator('#grid .card .open').click();await expect(page.locator('dialog')).toBeVisible();
 await page.goBack();await expect(page.locator('dialog')).not.toBeVisible();await expect(page.locator('#search')).toHaveValue('銀珠');
});

test('initial layout is stable during delayed catalogue fetch',async({page})=>{
 await page.setViewportSize({width:1280,height:800});
 let release;const gate=new Promise(resolve=>{release=resolve;});
 await page.route('**/data/gouache/catalog-20261103.json*',async route=>{await gate;await route.continue();});
 await page.goto(pageUrl,{waitUntil:'domcontentloaded'});
 await expect(page.locator('#os-global-nav')).toBeVisible();
 const before=await page.evaluate(()=>({header:document.querySelector('header').getBoundingClientRect().top,status:document.querySelector('#status').getBoundingClientRect().top,grid:document.querySelector('#grid').getBoundingClientRect().top}));
 release();await expect(page.locator('#status')).toContainText('232 / 232');
 const after=await page.evaluate(()=>({header:document.querySelector('header').getBoundingClientRect().top,status:document.querySelector('#status').getBoundingClientRect().top,grid:document.querySelector('#grid').getBoundingClientRect().top}));
 for(const key of Object.keys(before))expect(Math.abs(before[key]-after[key])).toBeLessThanOrEqual(4);
 await expect(page.locator('#groupButtons button').last()).toBeAttached();
 await page.locator('#group').selectOption({index:1});await expect(page.locator('#grid .card').first()).toBeVisible();
});
test('visual checkpoints desktop and mobile',async({page},testInfo)=>{
 await page.setViewportSize({width:1280,height:900});await page.goto(pageUrl);
 await expect(page.locator('#status')).toContainText('232 / 232');
 await page.screenshot({path:testInfo.outputPath('desktop-catalog.jpg'),type:'jpeg',quality:85,animations:'disabled'});
 await page.setViewportSize({width:390,height:844});await page.goto(pageUrl+'?row=84');await expect(page.locator('dialog')).toBeVisible();
 await expect.poll(()=>page.locator('.gallery img').first().evaluate(i=>i.complete&&i.naturalWidth>0)).toBeTruthy();
 await page.screenshot({path:testInfo.outputPath('mobile-five-images.jpg'),type:'jpeg',quality:85,animations:'disabled'});
});
