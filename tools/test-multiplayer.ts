import { io } from 'socket.io-client';

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runTest() {
  console.log('=== Socket.io 루미 몬스터즈 멀티플레이 통합 검증 시작 ===\n');
  const SERVER = 'http://localhost:2567';

  // 1. 플레이어 Alice 소켓 접속
  const socketA = io(SERVER, { transports: ['websocket', 'polling'], forceNew: true });
  let aliceId = '';
  let aliceWelcome: any = null;

  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Alice 접속 실패')), 5000);
    socketA.on('connect', () => {
      socketA.emit('join', { t: 'join', dev: 'Alice', mode: 'public' });
    });
    socketA.on('welcome', (m: any) => {
      clearTimeout(t);
      aliceId = m.id;
      aliceWelcome = m;
      console.log(`[Alice] 환영 패킷 수신: UID=${aliceId}, Name=${m.you.name}, Map=${m.you.map}`);
      resolve();
    });
    socketA.on('error', (e: any) => reject(new Error(JSON.stringify(e))));
  });

  // 2. 플레이어 Bob 소켓 접속
  const socketB = io(SERVER, { transports: ['websocket', 'polling'], forceNew: true });
  let bobId = '';
  let bobWelcome: any = null;

  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Bob 접속 실패')), 5000);
    socketB.on('connect', () => {
      socketB.emit('join', { t: 'join', dev: 'Bob', mode: 'public' });
    });
    socketB.on('welcome', (m: any) => {
      clearTimeout(t);
      bobId = m.id;
      bobWelcome = m;
      console.log(`[Bob] 환영 패킷 수신: UID=${bobId}, Name=${m.you.name}, Map=${m.you.map}`);
      resolve();
    });
    socketB.on('error', (e: any) => reject(new Error(JSON.stringify(e))));
  });

  // 3. 외형 설정 (setLook) - 신규 캐릭터 생성 절차
  console.log('\n[캐릭터 외형 설정]');
  await new Promise<void>((resolve) => {
    socketA.emit('action', { t: 'action', reqId: 1, action: { kind: 'setLook', look: 'f1', name: '앨리스' } });
    socketB.emit('action', { t: 'action', reqId: 2, action: { kind: 'setLook', look: 'm2', name: '밥' } });
    setTimeout(resolve, 300);
  });
  console.log('✓ Alice, Bob 외형 및 이름 설정 완료');

  // 4. 소셜 기능 검증: Alice가 Bob을 자신의 집(home)으로 초대
  console.log('\n[우편함/친구 초대 검증]');
  const invitePromise = new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Bob 초대 수신 타임아웃')), 5000);
    socketB.on('sim', (msg: any) => {
      if (msg.event?.type === 'invite' && msg.event.from === aliceId) {
        console.log(`✓ [Bob] Alice(${msg.event.fromName})의 초대장 수신: where=${msg.event.where}`);
        clearTimeout(t);
        resolve();
      }
    });
  });

  socketA.emit('action', { t: 'action', reqId: 3, action: { kind: 'invite', to: bobId, where: 'home' } });
  await invitePromise;

  // Bob이 초대 수락
  console.log('[Bob] 초대 수락 전송...');
  socketB.emit('action', { t: 'action', reqId: 4, action: { kind: 'acceptInvite', from: aliceId } });
  await sleep(600);

  // 5. 같은 방(Alice의 집)에서 서로 위치 동기화 검증
  console.log('\n[위치 동기화 (Movement Synchronization) 검증]');
  let bobSawAlice = false;
  let aliceSawBob = false;

  const moveTestPromise = new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('위치 동기화 타임아웃')), 5000);

    socketB.on('players', (msg: any) => {
      const found = msg.list.find((p: any) => p.id === aliceId);
      if (found && !bobSawAlice) {
        bobSawAlice = true;
        console.log(`✓ [Bob] Alice 위치 포착: (${found.x}, ${found.y}), 방향=${found.dir}, 동작=${found.anim}`);
        if (aliceSawBob) {
          clearTimeout(t);
          resolve();
        }
      }
    });

    socketA.on('players', (msg: any) => {
      const found = msg.list.find((p: any) => p.id === bobId);
      if (found && !aliceSawBob) {
        aliceSawBob = true;
        console.log(`✓ [Alice] Bob 위치 포착: (${found.x}, ${found.y}), 방향=${found.dir}, 동작=${found.anim}`);
        if (bobSawAlice) {
          clearTimeout(t);
          resolve();
        }
      }
    });
  });

  // Alice와 Bob이 각각 이동
  socketA.emit('move', { t: 'move', x: 50, y: 90, dir: 'down', anim: 'walk', seq: 10 });
  socketB.emit('move', { t: 'move', x: 70, y: 90, dir: 'left', anim: 'walk', seq: 10 });

  await moveTestPromise;
  console.log('✓ 양방향 플레이어 위치 동기화 성공!');

  // 6. 실시간 채팅 검증
  console.log('\n[실시간 채팅 동기화 검증]');
  const chatPromise = new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('채팅 수신 타임아웃')), 5000);
    socketA.on('chat', (msg: any) => {
      if (msg.text === '안녕 앨리스! 반가워.') {
        console.log(`✓ [Alice] Bob의 채팅 수신: "${msg.name}: ${msg.text}"`);
        clearTimeout(t);
        resolve();
      }
    });
  });

  socketB.emit('chat', { t: 'chat', text: '안녕 앨리스! 반가워.' });
  await chatPromise;

  // 7. 감정표현(Emote) 동기화 검증
  console.log('\n[감정표현(Emote) 동기화 검증]');
  const emotePromise = new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('감정표현 수신 타임아웃')), 5000);
    socketB.on('sim', (msg: any) => {
      if (msg.event?.type === 'emote' && msg.event.playerId === aliceId) {
        console.log(`✓ [Bob] Alice의 감정표현(하트) 수신: emote=${msg.event.emote}`);
        clearTimeout(t);
        resolve();
      }
    });
  });

  socketA.emit('action', { t: 'action', reqId: 5, action: { kind: 'emote', id: 2 } }); // id 2 = 하트
  await emotePromise;

  // 8. 퇴장(Disconnect) 브로드캐스트 검증
  console.log('\n[퇴장(Disconnect) 처리 검증]');
  const leavePromise = new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('퇴장 알림 타임아웃')), 5000);
    socketB.on('left', (msg: any) => {
      if (msg.id === aliceId) {
        console.log(`✓ [Bob] Alice 퇴장 확인 (left 수신: ${msg.id})`);
        clearTimeout(t);
        resolve();
      }
    });
  });

  socketA.disconnect();
  await leavePromise;

  socketB.disconnect();
  console.log('\n🎉 [결과] 모든 멀티플레이 기능 정상 동작 확인 완료!\n');
}

runTest().catch((e) => {
  console.error('\n❌ 테스트 실패:', e);
  process.exit(1);
});
