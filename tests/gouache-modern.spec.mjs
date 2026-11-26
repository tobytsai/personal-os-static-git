import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const data=JSON.parse(fs.readFileSync('public/data/gouache/catalog-20261103.json','utf8'));
const pageUrl='/pages/gouache-product-catalog-20261103.html';
test('source rows and images remain intact',async()=>{
 expect(data.length).toBe(232);expect(data.flatMap(p=>p.images).length).toBe(1160);
 expect(data.filter(p=>p.images.every(i=>i.thumb)).length).toBe(214);
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
 await page.getByRole('button',{name:'下一張'}).click();await expect(page.locator('.gallery-nav span')).toContainText('2 / 5');
 await page.getByRole('button',{name:'比較同色不同粒度'}).click();await expect(page.locator('#comparison article')).toHaveCount(4);
});
