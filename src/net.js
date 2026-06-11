/*
 * PeerJS 기반 P2P 네트워크 레이어.
 * 방장(호스트)이 권위 서버 역할: 게임 마스터(Majiang.Game)를 자기 브라우저에서
 * 돌리고, 게스트와는 PeerJS DataConnection으로 메시지를 주고받는다.
 * 시그널링은 PeerJS 공용 클라우드 브로커(0.peerjs.com)를 사용하므로
 * 별도 서버 없이 GitHub Pages 정적 호스팅만으로 동작한다.
 */
'use strict';

const ID_PREFIX = 'krnm1-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PING_INTERVAL = 10000;
const DEAD_TIMEOUT  = 35000;

function makeCode(len = 6) {
    let code = '';
    const buf = new Uint32Array(len);
    crypto.getRandomValues(buf);
    for (let i = 0; i < len; i++) code += CODE_CHARS[buf[i] % CODE_CHARS.length];
    return code;
}

function normCode(code) {
    return (code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

class HostNet {

    /*
     * cb: { onOpen(code), onFatal(message),
     *       onGuestJoin(guest), onGuestLeave(guest), onGuestData(guest, data) }
     */
    constructor(cb) {
        this._cb = cb;
        this.guests = [];          // { conn, peerId, name, lastSeen, send() }
        this.code = null;
        this._peer = null;
        this._closed = false;
        this._open(0);
    }

    _open(attempt) {
        if (attempt > 4) {
            this._cb.onFatal('방 코드를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.');
            return;
        }
        const code = makeCode();
        const peer = new Peer(ID_PREFIX + code, { debug: 1 });
        this._peer = peer;

        peer.on('open', () => {
            this.code = code;
            peer.on('disconnected', () => { if (!this._closed) peer.reconnect(); });
            this._pingTimer = setInterval(() => this._pingAll(), PING_INTERVAL);
            this._cb.onOpen(code);
        });
        peer.on('error', err => {
            if (err.type == 'unavailable-id' && !this.code) {
                peer.destroy();
                this._open(attempt + 1);
            }
            else if (!this.code) {
                this._cb.onFatal('서버에 연결할 수 없습니다: ' + err.type);
            }
            // 개별 연결 오류는 conn 단에서 처리
        });
        peer.on('connection', conn => this._accept(conn));
    }

    _accept(conn) {
        const guest = {
            conn,
            peerId: conn.peer,
            name: null,
            lastSeen: Date.now(),
            send: obj => { try { conn.send(obj) } catch (e) {} },
        };
        conn.on('open', () => {
            this.guests.push(guest);
        });
        conn.on('data', data => {
            guest.lastSeen = Date.now();
            if (!data || typeof data != 'object') return;
            if (data.type == 'pong') return;
            if (data.type == 'hello') {
                guest.name = String(data.name || '게스트').slice(0, 12);
                guest.ver = data.ver;
                this._cb.onGuestJoin(guest);
                return;
            }
            this._cb.onGuestData(guest, data);
        });
        const drop = () => this._drop(guest);
        conn.on('close', drop);
        conn.on('error', drop);
    }

    _drop(guest) {
        const i = this.guests.indexOf(guest);
        if (i < 0) return;
        this.guests.splice(i, 1);
        try { guest.conn.close() } catch (e) {}
        if (guest.name) this._cb.onGuestLeave(guest);
    }

    _pingAll() {
        const now = Date.now();
        for (const guest of this.guests.slice()) {
            if (now - guest.lastSeen > DEAD_TIMEOUT) this._drop(guest);
            else guest.send({ type: 'ping' });
        }
    }

    kick(guest) { this._drop(guest) }

    broadcast(obj) {
        for (const guest of this.guests) {
            if (guest.name) guest.send(obj);
        }
    }

    close() {
        this._closed = true;
        clearInterval(this._pingTimer);
        try { this._peer.destroy() } catch (e) {}
        this.guests = [];
    }
}

class GuestNet {

    /*
     * cb: { onOpen(), onData(data), onClose(), onFatal(message) }
     */
    constructor(code, cb) {
        this._cb = cb;
        this._closed = false;
        this._opened = false;
        this.lastSeen = Date.now();

        const peer = new Peer({ debug: 1 });
        this._peer = peer;

        peer.on('open', () => {
            const conn = peer.connect(ID_PREFIX + normCode(code), { reliable: true });
            this._conn = conn;
            conn.on('open', () => {
                this._opened = true;
                peer.on('disconnected', () => { if (!this._closed) peer.reconnect(); });
                this._watchTimer = setInterval(() => {
                    if (Date.now() - this.lastSeen > DEAD_TIMEOUT) this._die();
                }, PING_INTERVAL);
                this._cb.onOpen();
            });
            conn.on('data', data => {
                this.lastSeen = Date.now();
                if (!data || typeof data != 'object') return;
                if (data.type == 'ping') { this.send({ type: 'pong' }); return; }
                this._cb.onData(data);
            });
            conn.on('close', () => this._die());
            conn.on('error', () => this._die());
        });
        peer.on('error', err => {
            if (err.type == 'peer-unavailable') {
                this._cb.onFatal('해당 코드의 방을 찾을 수 없습니다.');
                this.close();
            }
            else if (!this._opened) {
                this._cb.onFatal('서버에 연결할 수 없습니다: ' + err.type);
                this.close();
            }
        });
    }

    _die() {
        if (this._closed || !this._opened) return;
        this.close();
        this._cb.onClose();
    }

    send(obj) {
        if (this._conn) { try { this._conn.send(obj) } catch (e) {} }
    }

    close() {
        this._closed = true;
        clearInterval(this._watchTimer);
        try { this._peer.destroy() } catch (e) {}
    }
}

module.exports = { HostNet, GuestNet, makeCode, normCode };
