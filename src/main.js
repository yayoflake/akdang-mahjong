/*
 * 넷마작 메인 앱: 화면 전환 + 방(로비) 관리 + 게임 시작/종료 오케스트레이션.
 *
 *  - 방장 브라우저가 게임 마스터(Majiang.Game)를 실행하는 권위 호스트.
 *  - 게스트는 PeerJS로 접속해 메시지를 중계받는 씬 클라이언트.
 *  - 빈 자리는 쯔모기리 AI로 채운다.
 */
'use strict';

const Majiang = require('@kobalab/majiang-core');
const UIPlayer = require('./uiplayer');
const GameUI = require('./ui');
const { TsumogiriAI, RemotePlayer } = require('./players');
const { HostNet, GuestNet, normCode } = require('./net');

const PROTO_VER = 1;

const $ = id => document.getElementById(id);

/* ---------- 화면 전환 ---------- */

function show(screen) {
    for (const s of document.querySelectorAll('.screen')) {
        s.classList.toggle('active', s.id == 'screen-' + screen);
    }
}

function myName() {
    const name = ($('input-name').value || '').trim().slice(0, 12) || '플레이어';
    localStorage.setItem('nm-name', name);
    return name;
}

/* ---------- 공통 게임 실행기 ---------- */

class GameSession {

    /*
     * 게임 화면을 점유하고 UIPlayer + GameUI를 연결한다.
     * opts: { label, onEnd() — 종국 확인 후, onLeave() — 나가기 버튼 }
     */
    constructor(opts) {
        this.ui = new GameUI($('game-root'), {
            onGameEnd: () => { this.destroy(); opts.onEnd(); },
        });
        this.player = new UIPlayer(this.ui);
        this.ui.attach(this.player);
        $('game-room-label').textContent = opts.label || '';
        $('btn-leave-game').onclick = opts.onLeave || null;
        show('game');
    }

    destroy() {
        this.ui.destroy();
    }
}

/* ---------- 방장 (호스트) ---------- */

class HostRoom {

    constructor() {
        this.slots = [
            { kind: 'host', name: myName() },
            { kind: 'empty' }, { kind: 'empty' }, { kind: 'empty' },
        ];
        this.playing = false;
        this.session = null;
        this.remotes = {};       // peerId → { remote: RemotePlayer, slot }
        this.aiCount = 0;

        $('room-status').textContent = '방 생성 중...';
        show('room');

        this.net = new HostNet({
            onOpen: code => {
                $('room-status').textContent = '';
                this.renderRoom();
            },
            onFatal: message => {
                alert(message);
                this.leave();
            },
            onGuestJoin: guest => this.onJoin(guest),
            onGuestLeave: guest => this.onLeave(guest),
            onGuestData: (guest, data) => this.onData(guest, data),
        });
        this.renderRoom();
    }

    onJoin(guest) {
        if (guest.ver !== undefined && guest.ver != PROTO_VER) {
            guest.send({ type: 'reject', reason: '클라이언트 버전이 다릅니다. 새로고침해 주세요.' });
            this.net.kick(guest);
            return;
        }
        if (this.playing) {
            guest.send({ type: 'reject', reason: '이미 대국이 진행 중인 방입니다.' });
            this.net.kick(guest);
            return;
        }
        const slot = this.slots.findIndex(s => s.kind == 'empty');
        if (slot < 0) {
            guest.send({ type: 'reject', reason: '방이 가득 찼습니다.' });
            this.net.kick(guest);
            return;
        }
        this.slots[slot] = { kind: 'guest', name: guest.name, guest };
        this.broadcastLobby();
        this.renderRoom();
    }

    onLeave(guest) {
        const slot = this.slots.findIndex(s => s.guest === guest);
        if (slot >= 0) {
            if (this.playing) {
                // 대국 중 이탈: 쯔모기리 AI가 대신 진행
                const entry = this.remotes[guest.peerId];
                if (entry) entry.remote.takeover();
                this.slots[slot] = { kind: 'ai', name: this.slots[slot].name + ' (AI)' };
            }
            else {
                this.slots[slot] = { kind: 'empty' };
            }
            this.broadcastLobby();
            this.renderRoom();
        }
    }

    onData(guest, data) {
        if (data.type == 'r') {
            const entry = this.remotes[guest.peerId];
            if (entry) entry.remote.onReply(data.seq, data.reply);
        }
    }

    addAI() {
        const slot = this.slots.findIndex(s => s.kind == 'empty');
        if (slot < 0) return;
        this.slots[slot] = { kind: 'ai', name: `AI ${++this.aiCount}호` };
        this.broadcastLobby();
        this.renderRoom();
    }

    removeSlot(i) {
        const s = this.slots[i];
        if (s.kind == 'guest') {
            s.guest.send({ type: 'reject', reason: '방장이 내보냈습니다.' });
            this.net.kick(s.guest);   // onLeave 경유로 정리됨
        }
        else if (s.kind == 'ai') {
            this.slots[i] = { kind: 'empty' };
            this.broadcastLobby();
            this.renderRoom();
        }
    }

    lobbyState() {
        return {
            type: 'lobby',
            code: this.net && this.net.code,
            slots: this.slots.map(s => ({ kind: s.kind, name: s.name || null })),
        };
    }

    broadcastLobby() {
        this.net.broadcast(this.lobbyState());
    }

    renderRoom() {
        renderRoomScreen(this.lobbyState(), {
            isHost: true,
            onAddAI: () => this.addAI(),
            onRemove: i => this.removeSlot(i),
            onStart: () => this.startGame(),
            onLeave: () => this.leave(),
        });
    }

    startGame() {
        if (this.playing) return;
        if (this.slots.some(s => s.kind == 'empty')) return;   // 4자리 충원 필수
        this.playing = true;
        this.slots[0].name = myName();
        this.broadcastLobby();
        this.renderRoom();

        const names = this.slots.map(s => s.name);
        const rule = Majiang.rule({ '場数': +$('select-length').value });

        this.session = new GameSession({
            label: `방 ${this.net.code}`,
            onEnd: () => this.backToRoom(),
            onLeave: () => {
                if (confirm('방을 닫고 나가시겠습니까? 모든 참가자의 대국이 종료됩니다.'))
                    this.leave();
            },
        });
        const players = [];
        this.remotes = {};
        for (let id = 0; id < 4; id++) {
            const s = this.slots[id];
            if (s.kind == 'host') {
                players[id] = this.session.player;
            }
            else if (s.kind == 'guest') {
                const remote = new RemotePlayer(obj => s.guest.send(obj));
                this.remotes[s.guest.peerId] = { remote, slot: id };
                players[id] = remote;
            }
            else {
                players[id] = new TsumogiriAI();
            }
        }
        // 게스트에게 시작 통지 (각자의 id 포함)
        for (let id = 0; id < 4; id++) {
            const s = this.slots[id];
            if (s.kind == 'guest') s.guest.send({ type: 'start', id, names });
        }

        const game = new Majiang.Game(players, () => {}, rule, '넷마작');
        game._model.player = names;
        game.speed = 2;
        this.game = game;
        game.kaiju();
    }

    backToRoom() {
        this.playing = false;
        this.session = null;
        this.game = null;
        // 대국 중 AI로 전환된 게스트 자리 비우기
        for (let i = 1; i < 4; i++) {
            if (this.slots[i].kind == 'ai' && this.slots[i].name.endsWith(' (AI)')) {
                this.slots[i] = { kind: 'empty' };
            }
        }
        this.net.broadcast({ type: 'toroom' });
        this.broadcastLobby();
        this.renderRoom();
        show('room');
    }

    leave() {
        this.net.broadcast({ type: 'closed' });
        if (this.game) this.game.stop();
        if (this.session) this.session.destroy();
        this.net.close();
        app.room = null;
        show('home');
    }
}

/* ---------- 게스트 ---------- */

class GuestRoom {

    constructor(code) {
        this.session = null;
        this.lobby = null;
        $('room-status').textContent = '접속 중...';
        show('room');
        renderRoomScreen({ code: normCode(code), slots: [] }, {
            isHost: false,
            onLeave: () => this.leave(),
        });

        this.net = new GuestNet(code, {
            onOpen: () => {
                $('room-status').textContent = '';
                this.net.send({ type: 'hello', name: myName(), ver: PROTO_VER });
            },
            onFatal: message => { alert(message); this.leave(); },
            onClose: () => {
                alert('방장과의 연결이 끊겼습니다.');
                this.leave();
            },
            onData: data => this.onData(data),
        });
    }

    onData(data) {
        switch (data.type) {
        case 'lobby':
            this.lobby = data;
            if (!this.session) this.renderRoom();
            break;
        case 'reject':
            alert(data.reason);
            this.leave();
            break;
        case 'start':
            if (this.session) this.session.destroy();
            this.session = new GameSession({
                label: `방 ${this.lobby ? this.lobby.code : ''}`,
                onEnd: () => this.exitGame(),
                onLeave: () => {
                    if (confirm('대국에서 나가시겠습니까? 남은 대국은 AI가 대신 둡니다.'))
                        this.leave();
                },
            });
            break;
        case 'm':
            if (this.session) {
                this.session.player.action(data.msg,
                    data.need
                        ? reply => this.net.send({ type: 'r', seq: data.seq, reply })
                        : undefined);
            }
            break;
        case 'toroom':
            // 호스트가 방으로 복귀. 내가 아직 결과 화면이면 그대로 두고,
            // 이미 나와 있으면 방 화면을 갱신한다.
            if (!this.session) {
                this.renderRoom();
                show('room');
            }
            break;
        case 'closed':
            alert('방장이 방을 닫았습니다.');
            this.leave();
            break;
        }
    }

    exitGame() {
        if (this.session) { this.session.destroy(); this.session = null; }
        this.renderRoom();
        show('room');
    }

    renderRoom() {
        if (this.lobby) {
            renderRoomScreen(this.lobby, {
                isHost: false,
                onLeave: () => this.leave(),
            });
        }
    }

    leave() {
        if (this.session) this.session.destroy();
        this.net.close();
        app.room = null;
        show('home');
    }
}

/* ---------- 방 화면 렌더링 ---------- */

function renderRoomScreen(lobby, handlers) {
    $('room-code').textContent = lobby.code || '......';
    const link = lobby.code
        ? location.origin + location.pathname + '#' + lobby.code : '';
    const linkEl = $('room-link');
    linkEl.textContent = link ? '초대 링크 복사' : '';
    linkEl.onclick = () => {
        navigator.clipboard.writeText(link).then(
            () => { linkEl.textContent = '복사됨!';
                    setTimeout(() => linkEl.textContent = '초대 링크 복사', 1500); },
            () => prompt('초대 링크:', link));
    };

    const list = $('room-players');
    list.innerHTML = '';
    const slots = lobby.slots.length ? lobby.slots
        : [{ kind: 'empty' }, { kind: 'empty' }, { kind: 'empty' }, { kind: 'empty' }];
    slots.forEach((s, i) => {
        const row = document.createElement('div');
        row.className = 'slot ' + s.kind;
        const label = document.createElement('span');
        label.textContent =
            s.kind == 'host'  ? `👑 ${s.name}` :
            s.kind == 'guest' ? `🙂 ${s.name}` :
            s.kind == 'ai'    ? `🤖 ${s.name}` : '— 비어 있음 —';
        row.appendChild(label);
        if (handlers.isHost && (s.kind == 'guest' || s.kind == 'ai')) {
            const x = document.createElement('button');
            x.className = 'slot-x';
            x.textContent = '✕';
            x.onclick = () => handlers.onRemove(i);
            row.appendChild(x);
        }
        list.appendChild(row);
    });

    $('btn-add-ai').style.display = handlers.isHost ? '' : 'none';
    $('btn-start').style.display = handlers.isHost ? '' : 'none';
    if (handlers.isHost) {
        const full = slots.length == 4 && slots.every(s => s.kind != 'empty');
        $('btn-add-ai').onclick = handlers.onAddAI;
        $('btn-start').onclick = handlers.onStart;
        $('btn-start').disabled = !full;
        $('room-wait').textContent =
            full ? '' : '네 자리가 모두 차야 시작할 수 있습니다. 빈 자리는 AI로 채울 수 있습니다.';
    }
    else {
        $('room-wait').textContent = '방장이 시작하기를 기다리는 중...';
    }
    $('btn-leave-room').onclick = handlers.onLeave;
}

/* ---------- 초기화 ---------- */

const app = { room: null };

function init() {
    $('input-name').value = localStorage.getItem('nm-name') || '';

    // 초대 링크로 들어온 경우 코드 자동 입력
    const hash = normCode(location.hash.slice(1));
    if (hash.length >= 4) $('input-code').value = hash;

    $('btn-create').onclick = () => {
        if (typeof Peer == 'undefined') {
            alert('네트워크 라이브러리를 불러오지 못했습니다.');
            return;
        }
        app.room = new HostRoom();
    };
    $('btn-join').onclick = () => {
        const code = normCode($('input-code').value);
        if (code.length < 4) { alert('방 코드를 입력하세요.'); return; }
        app.room = new GuestRoom(code);
    };
    $('input-code').addEventListener('keydown', e => {
        if (e.key == 'Enter') $('btn-join').click();
    });

    window.addEventListener('beforeunload', e => {
        if (app.room && (app.room.playing || app.room.session)) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
}

document.addEventListener('DOMContentLoaded', init);
