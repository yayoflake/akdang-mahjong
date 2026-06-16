/*
 * 브라우저 스모크 테스트 (node test/browser.js)
 *
 *  A. 솔로(연습) 모드: 게임 화면 진입 → DOM 봇으로 자동 플레이 → 진행 확인
 *  B. 멀티플레이: 호스트 + 게스트 2개 컨텍스트, 실제 PeerJS 클라우드 경유
 *
 * 스크린샷은 test/shots/ 에 저장.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = 8137;
const SHOTS = path.join(__dirname, 'shots');

const MIME = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
};

function serve() {
    const server = http.createServer((req, res) => {
        let file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0].split('#')[0]));
        if (file.endsWith(path.sep) || fs.existsSync(file) && fs.statSync(file).isDirectory()) {
            file = path.join(file, 'index.html');
        }
        if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
    });
    return new Promise(resolve => server.listen(PORT, () => resolve(server)));
}

let failures = 0;
function assert(cond, msg) {
    if (cond) console.log('  ok:', msg);
    else { failures++; console.error('  FAIL:', msg); }
}

function watchErrors(page, tag, list) {
    page.on('pageerror', err => {
        list.push(`${tag}: ${err.message}`);
        console.error(`  [pageerror ${tag}]`, err.message);
    });
    page.on('console', msg => {
        if (msg.type() == 'error' && !/favicon|ERR_NAME|peerjs|PeerJS/i.test(msg.text())) {
            console.log(`  [console.error ${tag}]`, msg.text().slice(0, 160));
        }
    });
}

/* DOM 봇: 다이얼로그 확인 / 패스 / 쯔모 / 무작위 타패 */
async function botStep(page) {
    try {
        const modalBtn = page.locator('.modal:not(.hidden) button.act').first();
        if (await modalBtn.count()) {
            await modalBtn.click({ timeout: 500 });
            return;
        }
        const pass = page.locator('.action-bar button.act.pass').first();
        if (await pass.count()) {
            await pass.click({ timeout: 500 });
            return;
        }
        const btns = page.locator('.action-bar button.act');
        const labels = await btns.allTextContents();
        const tsumo = labels.findIndex(t => t.includes('쯔모'));
        if (tsumo >= 0) {
            await btns.nth(tsumo).click({ timeout: 500 });
            return;
        }
        const tiles = page.locator('.hand.mine .tile.clickable');
        const n = await tiles.count();
        if (n) {
            // PC(마우스) 입력은 클릭 한 번에 즉시 타패된다.
            const t = tiles.nth(Math.floor(Math.random() * n));
            await t.click({ timeout: 500 });
        }
    }
    catch (e) { /* 렌더 갱신과의 경합은 다음 틱에서 재시도 */ }
}

async function playFor(pages, ms) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
        for (const p of pages) await botStep(p);
        await new Promise(r => setTimeout(r, 250));
    }
}

(async () => {
    fs.mkdirSync(SHOTS, { recursive: true });
    const server = await serve();
    const browser = await chromium.launch();
    const errors = [];

    /* ---------- A. 호스트 단독 + AI 3인 ---------- */
    console.log('[A] 호스트 단독 + AI 3인');
    {
        const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
        watchErrors(page, 'host-ai', errors);
        await page.goto(`http://localhost:${PORT}/`);
        await page.screenshot({ path: path.join(SHOTS, 'home.png') });

        await page.fill('#input-name', '스모크봇');
        await page.click('#btn-create');
        await page.waitForFunction(
            () => /^[A-Z0-9]{6}$/.test(document.getElementById('room-code').textContent),
            null, { timeout: 30000 });

        // 자리가 차기 전에는 시작 버튼이 비활성화되어야 함
        assert(await page.locator('#btn-start').isDisabled(),
               '자리 미충원 시 시작 버튼 비활성화');
        for (let i = 0; i < 3; i++) await page.click('#btn-add-ai');
        assert(!await page.locator('#btn-start').isDisabled(),
               '4자리 충원 후 시작 버튼 활성화');

        await page.click('#btn-start');
        await page.waitForSelector('#screen-game.active', { timeout: 5000 });
        await page.waitForSelector('.hand.mine .tile', { timeout: 10000 });
        assert(true, '게임 화면 진입 + 손패 렌더링');

        await playFor([page], 45000);
        await page.screenshot({ path: path.join(SHOTS, 'ai-game.png') });

        const riverTiles = await page.locator('.river .tile').count();
        assert(riverTiles >= 10, `버림패가 쌓여야 함 (${riverTiles}장)`);
        const score = await page.locator('.cscore .score').first().textContent();
        assert(/^\-?\d+$/.test(score.trim()), `점수 표시: ${score}`);
        await page.close();
    }

    /* ---------- B. 멀티플레이 (PeerJS 클라우드) ---------- */
    console.log('[B] 멀티플레이 (호스트+게스트, PeerJS)');
    {
        const ctxH = await browser.newContext({ viewport: { width: 1280, height: 860 } });
        const ctxG = await browser.newContext({ viewport: { width: 1280, height: 860 } });
        const pageH = await ctxH.newPage();
        const pageG = await ctxG.newPage();
        watchErrors(pageH, 'host', errors);
        watchErrors(pageG, 'guest', errors);

        await pageH.goto(`http://localhost:${PORT}/`);
        await pageH.fill('#input-name', '호스트');
        await pageH.click('#btn-create');
        await pageH.waitForFunction(
            () => /^[A-Z0-9]{6}$/.test(document.getElementById('room-code').textContent),
            null, { timeout: 30000 });
        const code = await pageH.locator('#room-code').textContent();
        console.log('  방 코드:', code);
        await pageH.screenshot({ path: path.join(SHOTS, 'room-host.png') });

        await pageG.goto(`http://localhost:${PORT}/`);
        await pageG.fill('#input-name', '게스트');
        await pageG.fill('#input-code', code);
        await pageG.click('#btn-join');
        await pageG.waitForFunction(
            () => document.querySelectorAll('#room-players .slot.guest, #room-players .slot.host').length >= 2,
            null, { timeout: 30000 });
        assert(true, '게스트가 방에 참가함');

        await pageH.waitForFunction(
            () => document.querySelectorAll('#room-players .slot.guest').length >= 1,
            null, { timeout: 10000 });

        // 호스트+게스트만으로는 시작 불가 → AI 2인 추가
        assert(await pageH.locator('#btn-start').isDisabled(),
               '2인만으로는 시작 버튼 비활성화');
        await pageH.click('#btn-add-ai');
        await pageH.click('#btn-add-ai');

        await pageH.click('#btn-start');
        await pageH.waitForSelector('#screen-game.active', { timeout: 10000 });
        await pageG.waitForSelector('#screen-game.active', { timeout: 10000 });
        await pageH.waitForSelector('.hand.mine .tile', { timeout: 10000 });
        await pageG.waitForSelector('.hand.mine .tile', { timeout: 10000 });
        assert(true, '호스트/게스트 모두 게임 화면 진입');

        await playFor([pageH, pageG], 45000);
        await pageH.screenshot({ path: path.join(SHOTS, 'mp-host.png') });
        await pageG.screenshot({ path: path.join(SHOTS, 'mp-guest.png') });

        const rH = await pageH.locator('.river .tile').count();
        const rG = await pageG.locator('.river .tile').count();
        assert(rH >= 10, `호스트 화면에 버림패 (${rH}장)`);
        assert(rG >= 10, `게스트 화면에 버림패 (${rG}장)`);

        // 게스트 이탈 → 호스트 쪽 대국은 AI 대타로 계속되어야 함
        await pageG.close({ runBeforeUnload: false });
        await playFor([pageH], 12000);
        const rH2 = await pageH.locator('.river .tile').count();
        assert(rH2 >= rH, `게스트 이탈 후에도 대국 진행 (${rH} → ${rH2}장)`);

        await ctxH.close();
        await ctxG.close();
    }

    /* ---------- C. 모바일 터치 타패 (첫 탭 강조 → 재탭 타패) ---------- */
    console.log('[C] 모바일 터치 입력 (첫 탭 강조 → 재탭 타패)');
    {
        const ctx = await browser.newContext({
            viewport: { width: 420, height: 880 }, hasTouch: true, isMobile: true,
        });
        const page = await ctx.newPage();
        watchErrors(page, 'touch', errors);
        await page.goto(`http://localhost:${PORT}/`);
        await page.fill('#input-name', '터치봇');
        await page.click('#btn-create');
        await page.waitForFunction(
            () => /^[A-Z0-9]{6}$/.test(document.getElementById('room-code').textContent),
            null, { timeout: 30000 });
        for (let i = 0; i < 3; i++) await page.click('#btn-add-ai');
        await page.click('#btn-start');
        await page.waitForSelector('#screen-game.active', { timeout: 10000 });

        let verified = false;
        const deadline = Date.now() + 40000;
        while (Date.now() < deadline && !verified) {
            try {
                const modalBtn = page.locator('.modal:not(.hidden) button.act').first();
                if (await modalBtn.count()) { await modalBtn.click({ timeout: 500 }); continue; }

                const clickable = page.locator('.hand.mine .tile.clickable');
                if (await clickable.count() > 0) {
                    const before = await page.locator('.sw0 .river .tile').count();
                    const t = clickable.first();
                    await t.tap();
                    await page.waitForTimeout(150);
                    assert(await page.locator('.hand.mine .tile.selected').count() >= 1,
                           '첫 탭에 패가 강조됨(selected)');
                    assert(await page.locator('.sw0 .river .tile').count() === before,
                           '첫 탭만으로는 타패되지 않음');
                    await t.tap();
                    await page.waitForFunction(
                        b => document.querySelectorAll('.sw0 .river .tile').length > b,
                        before, { timeout: 5000 });
                    assert(true, '같은 패 재탭으로 타패 완료');
                    verified = true;
                    break;
                }
                // 타패 차례가 아니면(남의 패 반응 등) 패스로 흘려보낸다
                const pass = page.locator('.action-bar button.act.pass').first();
                if (await pass.count()) await pass.click({ timeout: 500 });
            }
            catch (e) { /* 렌더 경합 → 재시도 */ }
            await page.waitForTimeout(200);
        }
        assert(verified, '터치 타패 시퀀스 검증');
        await ctx.close();
    }

    await browser.close();
    server.close();

    assert(errors.length == 0, `페이지 오류 없음 (${errors.length}건)`);
    if (failures) {
        console.error(`\n${failures}개 실패`);
        process.exit(1);
    }
    console.log('\n브라우저 테스트 통과 ✓');
})().catch(e => { console.error(e); process.exit(1); });
