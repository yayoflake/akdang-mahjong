/*
 * 역(役)·유국 이름 일본어 → 한국어 변환
 */
'use strict';

const YAKU_KO = {
    '立直':             '리치',
    'ダブル立直':       '더블 리치',
    '一発':             '일발',
    '門前清自摸和':     '멘젠쯔모',
    '平和':             '핑후',
    '断幺九':           '탕야오',
    '一盃口':           '이페코',
    '海底摸月':         '해저모월',
    '河底撈魚':         '하저로어',
    '嶺上開花':         '영상개화',
    '槍槓':             '창깡',
    '三色同順':         '삼색동순',
    '一気通貫':         '일기통관',
    '混全帯幺九':       '찬타',
    '七対子':           '치토이츠',
    '対々和':           '토이토이',
    '三暗刻':           '산안커',
    '三槓子':           '산깡쯔',
    '三色同刻':         '삼색동각',
    '混老頭':           '혼노두',
    '小三元':           '소삼원',
    '混一色':           '혼일색',
    '純全帯幺九':       '준찬타',
    '二盃口':           '량페코',
    '清一色':           '청일색',
    '国士無双':         '국사무쌍',
    '国士無双十三面':   '국사무쌍 13면 대기',
    '四暗刻':           '스안커',
    '四暗刻単騎':       '스안커 단기',
    '大三元':           '대삼원',
    '字一色':           '자일색',
    '緑一色':           '녹일색',
    '清老頭':           '청노두',
    '四槓子':           '스깡쯔',
    '小四喜':           '소사희',
    '大四喜':           '대사희',
    '九蓮宝燈':         '구련보등',
    '純正九蓮宝燈':     '순정 구련보등',
    '天和':             '천화',
    '地和':             '지화',
    'ドラ':             '도라',
    '赤ドラ':           '적도라',
    '裏ドラ':           '우라도라',
    '翻牌 白':          '역패 백',
    '翻牌 發':          '역패 발',
    '翻牌 中':          '역패 중',
};

const FENG_KO = { '東': '동', '南': '남', '西': '서', '北': '북' };

function yakuName(name) {
    if (YAKU_KO[name]) return YAKU_KO[name];
    let m = name.match(/^(場風|自風)\s*(.)$/);
    if (m) {
        const kind = m[1] == '場風' ? '장풍' : '자풍';
        return kind + ' ' + (FENG_KO[m[2]] || m[2]);
    }
    return name;
}

const PINGJU_KO = {
    '荒牌平局':   '유국',
    '九種九牌':   '구종구패',
    '四家立直':   '4인 리치',
    '三家和':     '트리플 론 (삼가화)',
    '四風連打':   '사풍연타',
    '四開槓':     '사깡산료',
    '流し満貫':   '나가시 만관',
};

function pingjuName(name) {
    return PINGJU_KO[name] || name;
}

// 판수·부수에 따른 점수 등급 명칭
function rankLabel(hule) {
    if (hule.damanguan) {
        return hule.damanguan > 1 ? `${hule.damanguan}배 역만` : '역만';
    }
    const fan = hule.fanshu;
    if (fan >= 13) return '헤아림 역만';
    if (fan >= 11) return '삼배만';
    if (fan >= 8)  return '배만';
    if (fan >= 6)  return '하네만';
    if (fan >= 5)  return '만관';
    if (fan >= 3 && hule.defen >= 8000) return '만관';
    return '';
}

// 결과창 점수 표기 문자열.
//   - 역만(역만역 성립): 등급명만 ("역만 32000점", "2배 역만 64000점")
//   - 그 외: "판 부" 먼저, 만관 이상이면 등급명을 덧붙임
//     ("4판 30부 7700점", "5판 30부 만관 8000점", "13판 40부 헤아림 역만 32000점")
//   부수·판수는 점수와 별개로 손패의 가치를 나타내는 정보이므로 역만 외에는 항상 표시.
function scoreText(hule) {
    const label = rankLabel(hule);
    if (hule.damanguan) {
        return `${label} ${hule.defen}점`;
    }
    let head = `${hule.fanshu}판 ${hule.fu}부`;
    if (label) head += ` ${label}`;
    return `${head} ${hule.defen}점`;
}

module.exports = { yakuName, pingjuName, rankLabel, scoreText, FENG_KO };
