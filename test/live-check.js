/*
 * 배포된 GitHub Pages 사이트 대상 최종 스모크 테스트
 *   node test/live-check.js [url]
 */
'use strict';

const { chromium } = require('playwright');

const URL = process.argv[2] || 'https://yayoflake.github.io/akdang-mahjong/';

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto(URL, { waitUntil: 'networkidle' });
    console.log('타이틀:', await page.title());

    // 솔로 대국 진입
    await page.fill('#input-name', '라이브체크');
    await page.click('#btn-solo');
    await page.waitForSelector('#screen-game.active', { timeout: 10000 });
    await page.waitForSelector('.hand.mine .tile img', { timeout: 10000 });
    console.log('ok: 게임 진입 + 타일 SVG 로드');

    // 방 생성 (PeerJS 연결 확인)
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.fill('#input-name', '라이브체크');
    await page.click('#btn-create');
    await page.waitForFunction(
        () => /^[A-Z0-9]{6}$/.test(document.getElementById('room-code').textContent),
        null, { timeout: 30000 });
    console.log('ok: 방 생성 (PeerJS 연결, 코드 ' +
                await page.locator('#room-code').textContent() + ')');

    await browser.close();
    if (errors.length) {
        console.error('페이지 오류:', errors);
        process.exit(1);
    }
    console.log('\n라이브 사이트 검증 통과 ✓');
})().catch(e => { console.error(e); process.exit(1); });
