# 학습 사전 비활성(inactive) 후보 전수 검토

- 1차 키워드 후보: 264건 (스크립트: `scripts/42_flag_inactive.py`)
- 최종 inactive: 19건 / keep_but_sense(참고, 활성 유지): 88건 / keep: 157건
- 판정 기준: (a) inactive = 표제어의 주된 뜻이 성적·외설·비속·차별이라 학습 사전에 부적절 / (b) keep = 의학·일반·중립 단어 / (c) keep_but_sense = 표제어는 정상, 일부 sense만 해당(참고).
- JLPT 급수가 있는 항목은 원칙적으로 keep(급수 시험 어휘). 경계 사례는 보수적으로 inactive 처리.

| jmdict_id | word | reading | JLPT | gloss(sense별 요약) | 판정 | 사유 |
|---|---|---|---|---|---|---|
| 1000320 | あそこ | あそこ | N5 | #1[pn]uk: there; over there; that place || #2[n]col/uk/euph: genitals; private parts; nether regions || #3[n]uk: that far; that much; that point | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1000580 | あれ | あれ | N5 | #1[pn]uk: that; that thing || #2[pn]uk: that person || #3[pn]uk: then; that time || #4[pn]uk: that place (over there) || #5[n]col/euph/uk: down there (i.e. one's genitals) || #6[n]col/euph/uk: period; menses | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1001370 | おっぱい | おっぱい | - | #1[n]chn/col: boobs; boobies; breasts || #2[n]chn: breast milk | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1003280 | がやがや | がやがや | - | #1[adv,adv-to,vs]on-mim: noisily (crowd of people talking); clamorously; in a hubbub | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1007960 | ちんちん | ちんちん | - | #1[n]chn: penis || #2[adv,adv-to]on-mim: with a tinkle; with a jingle || #3[adv,adv-to]on-mim: with a whistle (of a kettle) || #4[n,vs,vi]: sitting up and begging (of a dog) || #5[n]: juvenile black porgy || #6[n]: children's game in which one hops on one foot || #7[adj-na]: very hot (e.g. of tea) | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1013300 | わいわい | わいわい | - | #1[adv]on-mim: noisily; clamorously; boisterously || #2[adv]on-mim: incessantly (complaining, pestering, etc.); going on and on; making a fuss (of something) || #3[adv]on-mim: loudly (crying); wailing; bawling | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1016490 | アダルト | アダルト | - | #1[adj-na,n]: adult || #2[adj-na,n]: adult; pornographic; explicit | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1021040 | イエロー | イエロー | - | #1[n,adj-no]: yellow || #2[n]abbr: yellow card || #3[n]sens: Asian; Oriental; yellow-skinned person | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1021430 | イット | イット | - | #1[n]: "it"; sex appeal | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1028510 | S | エス | - | #1[n]: S; s || #2[n]: south || #3[n]: sulfur || #4[pref]: nth year in the Shōwa era (1926.12.25-1989.1.7) || #5[n]: small || #6[n]: second || #7[n]: subject || #8[n]: sadist; sadistic || #9[n]: sister (female partner in a homosexual relationship) || #10[n]: S rank (top rank on a SABCDEF scale); S gr… | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1029150 | H | エッチ | - | #1[n]: H; h || #2[adj-na,n]uk: indecent; lewd; sexy || #3[n,vs,vi]uk/col/euph: (having) sex || #4[n]uk: pervert || #5[pref]abbr: nth year in the Heisei era (1989.1.8-2019.4.30) || #6[n]: hour || #7[n]: hydrogen (H) || #8[n]: hole | inactive | H(エッチ) — 표제어 자체가 일상적으로 "섹스/음란하다"를 뜻하는 통용 속어(알파벳/연호 등 다른 sense는 부차적) |
| 1030660 | エロ | エロ | - | #1[adj-na,n]abbr: erotic; pornographic; obscene || #2[n-pref]: perverted; horny; dirty | inactive | エロ — "야하다/포르노"의 약어, 유일한 실질 의미가 외설물 지칭 |
| 1030730 | エロス | エロス | - | #1[n]: eros; sexual desire; physical love || #2[n]: Eros (god) || #3[n]: (Platonic) Eros || #4[n]: Eros (asteroid) | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1030780 | エロチック | エロチック | - | #1[adj-na]: erotic | inactive | エロチック — "에로틱하다", 단일 sense 전체가 성적 묘사 형용사 |
| 1036130 | オンリー | オンリー | - | #1[suf]: only; just; solely || #2[n]hist: prostitute attached to a single member of the post-WWII occupation forces | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1046660 | グラフィック | グラフィック | - | #1[n,adj-na]: graphics; graphic || #2[n]: graphic magazine; pictorial magazine | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1046760 | グラマー | グラマー | - | #1[adj-na]: voluptuous; full-breasted; buxom || #2[n]: voluptuous woman; big-breasted woman; glamour girl | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1049290 | コーポ | コーポ | - | #1[n]abbr: apartment building; block of flats; condominium | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1052870 | コンドーム | コンドーム | - | #1[n]: condom | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1052880 | コンドミニアム | コンドミニアム | - | #1[n]: condominium | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1054570 | ゴム | ゴム | N2 | #1[n]uk: gum; rubber || #2[n]abbr/uk: eraser || #3[n]col/uk: condom | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1060270 | シスター | シスター | - | #1[n]: sister (sibling) || #2[n]: (Catholic) sister || #3[n]: sister (female partner in a homosexual relationship) | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1063530 | シングル | シングル | - | #1[n,adj-no]: single || #2[n,adj-no]abbr: single bed; hotel room with a single bed || #3[adj-no,n]: single-breasted || #4[adj-no,n]: single-cuffed || #5[n,adj-no]abbr: single width (of cloth; usu. 0.71 meters) || #6[n]abbr: singles (tennis, badminton, etc.) || #7[n]abbr: single || #8[n]: single-figu… | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1064850 | ジプシー | ジプシー | - | #1[n]sens: gypsy; gipsy | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1068100 | スキン | スキン | - | #1[n]: skin || #2[n]col: condom || #3[n]: skin (custom graphical user interface for an application) | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1071380 | ストリッパー | ストリッパー | - | #1[n]: stripper | inactive | ストリッパー — "스트리퍼", 성산업 직업명 단일 sense |
| 1071390 | ストリップ | ストリップ | - | #1[n]abbr: strip show; striptease || #2[n]: stripping; removing one's clothes || #3[n]: strip (e.g. of wood) | inactive | ストリップ — 주 용법이 스트립쇼/탈의쇼(목재 조각 등 다른 sense는 부차적) |
| 1074470 | セクシー | セクシー | - | #1[adj-na]: sexy | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1074510 | セクハラ | セクハラ | - | #1[n]abbr: sexual harassment | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1074570 | セックス | セックス | N1 | #1[n,vs,vi]: sex; sexual intercourse || #2[n]: (one's) sex; gender | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1075340 | ソープ | ソープ | - | #1[n]: soap || #2[n]abbr/sl: soapland; brothel where one can bathe with prostitutes | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1075350 | ソープランド | ソープランド | - | #1[n]: soapland; brothel where one can bathe with prostitutes | inactive | ソープランド — 성매매 업소(소프랜드) 지칭 단일 sense |
| 1077110 | ダブル | ダブル | N2 | #1[n,adj-no]: double || #2[n]abbr: double bed; hotel room with a double bed || #3[adj-no,n]abbr: double-breasted || #4[adj-no,n]: double-cuffed || #5[n,adj-no]abbr: double width (of cloth; usu. 1.42 meters) || #6[n]abbr: doubles (e.g. in tennis) | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1077750 | ちび | ちび | - | #1[n]uk/sens: small child; pipsqueak; small fry || #2[n]sens/uk: short person; midget; dwarf || #3[n]uk: small animal; runt || #4[pref]uk: worn down (pencil, etc.) | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1080290 | テレクラ | テレクラ | - | #1[n]abbr: telephone dating or sex service; sex chat line | inactive | テレクラ — 전화 데이트/성매매 알선 서비스 단일 sense |
| 1092210 | ヌード | ヌード | - | #1[n]: nude | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1092540 | ネイキッド | ネイキッド | - | #1[adj-f]: naked | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1098500 | バスト | バスト | - | #1[n]: bust (measurement) || #2[n]: breasts; bosom || #3[n]: bust (sculpture); half-length portrait | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1098760 | バック | バック | N2 | #1[n]: back; rear || #2[n]: background; backdrop || #3[n]: backing; support; backer || #4[n,vs,vi]: going backwards; reversing; backing up || #5[n]abbr: reverse (gear) || #6[n,vs,vt]: refunding; returning (e.g. profits) || #7[n]: back (player) || #8[n]abbr: backstroke (swimming) || #9[n]abbr: backha… | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1103890 | ヒップ | ヒップ | - | #1[n]: hips; buttocks; backside || #2[adj-na]: hip; trendy; cool | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1107140 | ピンク | ピンク | N2 | #1[n,adj-no]: pink || #2[adj-no,n]: erotic; blue; pornographic | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1109970 | フェラチオ | フェラチオ | - | #1[n]: fellatio; blow job | inactive | フェラチオ — 구강성교, 노골적 성행위 명칭 단일 sense |
| 1114550 | ブルセラ | ブルセラ | - | #1[n]sl: used women's clothing such as bloomers and high-school sailor-suit uniforms (esp. as a source of sexual arousal) | inactive | ブルセラ — 중고 여성 속옷·교복을 성적 흥분 목적으로 거래 — 특정 성적 페티시 산업 용어 |
| 1114780 | ブレスト | ブレスト | - | #1[n]: breast || #2[n]abbr: breaststroke | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1118100 | ヘア | ヘア | - | #1[n]: hair (on the head) || #2[n]: pubic hair | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1118850 | ヘルス | ヘルス | - | #1[n]: health || #2[n]abbr: type of brothel/massage parlor (parlour) | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1122990 | ホワイト | ホワイト | - | #1[n,adj-no]: white || #2[n]: correction fluid; white-out | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1125960 | ポルノ | ポルノ | - | #1[n]abbr: pornography; porn; porno | inactive | ポルノ — 포르노그래피 단일 sense |
| 1127020 | マイノリティー | マイノリティー | - | #1[n]: minority || #2[n]: (sexual, ethnic) minority; minority group | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1127580 | マザコン | マザコン | - | #1[n]: being a mama's boy; having an (overly) strong attachment to one's mother || #2[n]abbr: Oedipus complex; sexual attraction to one's mother | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1130040 | マンション | マンション | N2 | #1[n]: condominium (usu. mid or high-rise); apartment building; apartment house | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1133060 | メガホン | メガホン | - | #1[n]: megaphone | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1135150 | モーテル | モーテル | N1 | #1[n]: motel || #2[n]: drive-in love hotel | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1137670 | ラーゲ | ラーゲ | - | #1[n]: sex position | inactive | ラーゲ — 성행위 체위를 뜻하는 희귀 외래어, 유일한 의미 |
| 1138530 | ラウドスピーカー | ラウドスピーカー | - | #1[n]: loudspeaker | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1144630 | レイプ | レイプ | - | #1[n,vs,vt]: rape; sexual assault | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1146400 | ローション | ローション | - | #1[n]: lotion || #2[n]abbr: sexual lubricant | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1146500 | ローター | ローター | - | #1[n]: rotor || #2[n]: love egg; egg vibrator (sex toy) | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1150870 | 愛人 | あいじん | - | #1[n]: lover; mistress | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1151580 | いたずら | いたずら | N3 | #1[n,vs,vt,vi]uk: mischief; prank; trick || #2[adj-na]uk: mischievous; naughty || #3[n,vs,vt]uk/hum: pastime; hobby || #4[n,vs,vt]uk: playing with (e.g. a lighter); fooling around with; messing around with || #5[n,vs,vi]uk/euph: lewd behaviour; sexual misconduct; sexual assault | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1154320 | あん摩 | あんま | - | #1[n,vs,vt]: massage (esp. anma, a traditional form of Japanese massage) || #2[n]sens: masseur; masseuse; massager | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1155950 | 囲い | かこい | - | #1[n]: enclosure; fence; wall || #2[n]: storage (of fruit, vegetables, etc.) || #3[n]: partitioned area of a room for conducting tea ceremonies || #4[n]abbr: mistress || #5[n]: castle; strong defensive position | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1155960 | 囲う | かこう | - | #1[v5u,vt]: to enclose; to surround; to encircle || #2[v5u,vt]: to shelter (e.g. a criminal); to shield; to hide || #3[v5u,vt]: to keep (e.g. a mistress) || #4[v5u,vt]: to store (vegetables, fruit, etc.); to preserve | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1157860 | 異性 | いせい | N1 | #1[n,adj-no]: the opposite sex || #2[n,adj-no]: isomerism | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1173410 | 営み | いとなみ | - | #1[n]: activity; action; performance || #2[n]: occupation; business; work || #3[n]euph: sexual intercourse; sex || #4[n]: preparations | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1178940 | 汚い | きたない | N5 | #1[adj-i]: dirty; filthy; foul || #2[adj-i]: disordered; messy; untidy || #3[adj-i]: indecent (language, etc.); dirty; vulgar || #4[adj-i]: dastardly; mean; base || #5[adj-i]: stingy; greedy | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1178980 | 汚らわしい | けがらわしい | N1 | #1[adj-i]: filthy; unfair; dirty | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1179030 | 汚水 | おすい | - | #1[n]: filthy water; sewage | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1182060 | 黄身 | きみ | - | #1[n]: egg yolk | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1184040 | 音符 | おんぷ | - | #1[n]: musical note; note symbol || #2[n]: phonetic symbol (incl. the kanji and kana-doubling symbols, vowel-lengthening symbol, etc.) || #3[n]: part of a kanji for which the role is primarily to represent the pronunciation (as opposed to the meaning) | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1186030 | 下等 | かとう | - | #1[adj-na,adj-no,n]: inferior; base; vulgar | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1186230 | 下品 | げひん | N2 | #1[adj-na,n]: vulgar; indecent; coarse | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1194780 | 花盛り | はなざかり | - | #1[n,adj-no]: flowers in full bloom; time of year in which flowers are in full bloom || #2[n,adj-no]: the age at which someone (esp. a woman) is at the peak of their beauty || #3[n,adj-no]: booming or peaking (in popularity) | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1199340 | 回し | まわし | - | #1[n,n-suf]: mawashi; belt; loincloth || #2[n]: mantle; cape || #3[n]: gang rape | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1199350 | 回す | まわす | N3 | #1[v5s,vt]: to turn; to rotate; to spin || #2[v5s,vt]: to pass around; to send around; to hand around || #3[v5s,vt]: to move (someone or something to where its needed); to send; to bring || #4[v5s,vt]: to turn (to a new use); to use (for something else) || #5[v5s,vt]: to turn on (something that turn… | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1200480 | 懐 | ふところ | - | #1[n]: inside the breast of one's clothing (esp. kimono); bosom; (breast) pocket || #2[n]: space between one's chest and outstretched arms; (one's) reach || #3[n]: heart (e.g. of a mountain); bosom (e.g. of nature); depths || #4[n]: mind; heart; inner thoughts || #5[n]: money (one is carrying); purs… | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1203850 | 外人 | がいじん | - | #1[n]sens: foreigner (esp. one of European ancestry); gaijin; whitey | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1206350 | 隔て | へだて | - | #1[n]: partition; division; barrier || #2[n]: discrimination; partiality; distinction (in treatment) || #3[n]: reserve; distance (in a relationship); estrangement | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1214060 | 竿 | さお | N1 | #1[n]: rod; pole || #2[n]: neck (of a shamisen, etc.); shamisen || #3[n]: beam (i.e. the crossbar of a balance) || #4[n]: single line (esp. as a flying formation for geese) || #5[n]sl: penis || #6[ctr]: counter for flags (on poles); counter for long, thin Japanese sweets (e.g. yōkan) | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1215220 | 鑑別 | かんべつ | - | #1[n,vs,vt,adj-no]: discrimination; judgement; judgment | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1215810 | 関係 | かんけい | N4 | #1[n,vs,vi]: relation; relationship; connection || #2[n,vs,vi]: participation; involvement; concern || #3[n,vs,vi]: influence; effect || #4[n,vs,vi]: sexual relations; sexual relationship || #5[n-suf]: related to; connected to | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1216560 | 丸太 | まるた | - | #1[n]: log || #2[n]uk: dace (Tribolodon hakonensis) || #3[n]uk/hist/sens: test subject (of human experiments performed by Unit 731 during WWII) | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1221900 | キチガイ | キチガイ | - | #2[n,n-suf]sens/uk: mania; craze; obsession | inactive | キチガイ — 정신질환자를 비하하는 일본어 방송금지 차별어(미치광이) |
| 1228750 | 急所 | きゅうしょ | - | #1[n]: vital part (of the body); tender spot; weak point || #2[n]: key point; essential point; crux (of a problem) || #3[n]col: male crotch (as a target in fighting) || #4[n]: vital point; critical place to make a move | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1234350 | 共学 | きょうがく | N1 | #1[n,vs,vi]: coeducation; mixed-sex education | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1237820 | 胸 | むね | N3 | #1[n]: chest; breast || #2[n]: breasts; bosom; bust || #3[n]: heart || #4[n]: lungs || #5[n]: stomach || #6[n]: heart; mind; feelings | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1237980 | 胸部 | きょうぶ | - | #1[n]: chest; breast | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1239740 | 曲げる | まげる | N2 | #1[v1,vt]: to bend; to crook; to bow || #2[v1,vt]: to lean; to tilt; to incline || #3[v1,vt]: to bend (the truth); to distort; to twist || #4[v1,vt]: to yield (a point); to depart (from a principle); to ignore (what one really thinks) || #5[v1,vt]: to pawn | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1240530 | 玉 | たま | N3 | #1[n]: ball; sphere; globe || #2[n]: bead (of sweat, dew, etc.); drop; droplet || #3[n]: ball (in sports); pitch (e.g. in baseball) || #4[n]: pile (of noodles, etc.) || #5[n]: bullet || #6[n]: bulb (i.e. a light bulb) || #7[n]: lens (of glasses, etc.) || #8[n]: bead (of an abacus) || #9[n]sl/abbr: b… | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1242600 | 金 | きん | N3 | #1[n]: gold (metal) || #2[n]: gold (color) || #3[n]: gold (medal); first place (prize) || #4[n,adj-no]: something of great value; something golden (e.g. silence) || #5[n]: money; gold coin || #6[n]: sum (of money) || #7[n]abbr: Friday || #8[n,ctr]: karat (measure of purity of gold); carat || #9[n]: … | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1244250 | 区別 | くべつ | N3 | #1[n,vs,vt]: distinction; differentiation; discrimination | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1250160 | 契る | ちぎる | N1 | #1[v5r]: to pledge; to vow; to promise || #2[v5r]: to have sexual intercourse (esp. between husband and wife); to share a bed | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1252560 | 軽い | かるい | N5 | #1[adj-i]: light (i.e. not heavy); feeling light (i.e. offering little resistance, moving easily) || #2[adj-i]: light (i.e. of foot); effortless; nimble || #3[adj-i]: non-serious; minor; unimportant || #4[adj-i]: slight; small; gentle || #5[adj-i]: easy; simple || #6[adj-i]: indiscriminate || #7[adj… | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1253780 | 隙 | すき | - | #1[n]: gap; opening; room || #2[n]: break; interval; spare moment || #3[n]: unguarded moment; carelessness; weak spot || #4[n]: chance; opportunity | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1253790 | 隙間 | すきま | N2 | #1[n]: gap; opening; aperture || #2[n]dated: spare moment; interval; break || #3[n]dated: unguarded moment; carelessness; chink in one's armor | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1256490 | 兼 | けん | - | #1[conj]: and (concurrently; e.g. chauffeur and secretary); in addition to; at the same time | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1257240 | 嫌い | きらい | N5 | #1[adj-na,n]: disliking; hating; detesting || #2[n]uk: tendency; smack (of); touch (of) || #3[n]uk: distinction; discrimination | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1257270 | いやらしい | いやらしい | N1 | #1[adj-i]uk: unpleasant; disagreeable; nasty || #2[adj-i]uk: lewd; lascivious; obscene | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1259250 | みっともない | みっともない | N2 | #1[adj-i]uk: shameful; disgraceful; unsightly | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1259500 | 見苦しい | みぐるしい | N1 | #1[adj-i]: unsightly; ugly; unseemly | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1263430 | 玄人 | くろうと | N1 | #1[n]: expert; professional; master || #2[n]: woman in the nightlife business; demimondaine; geisha and prostitutes | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1267460 | 股 | また | N1 | #1[n]: groin; thigh; crotch || #2[n]: fork (in a tree, road, river, etc.); tines (of a fork) | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1271620 | 乞食 | こじき | - | #1[n]sens: beggar || #2[n,vs,vi]: begging | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1271700 | 交わる | まじわる | N1 | #1[v5r,vi]: to cross; to intersect; to join || #2[v5r,vi]: to associate with; to mingle with; to consort with || #3[v5r,vi]: to have a sexual relationship; to copulate | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1272280 | 交通 | こうつう | N4 | #1[n,vs]: traffic; transportation || #2[n,vs]: communication; exchange (of ideas, etc.) || #3[n,vs]: intercourse | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1279120 | 攻め | せめ | N1 | #1[n]: attack; offence; offense || #2[n]uk/sl: top (dominant partner of a homosexual relationship) || #3[suf]: barrage (of); flood (of) | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1280080 | 甲乙 | こうおつ | - | #1[n]: first and second; A and B || #2[n]: superiority and (or) inferiority; distinction (in quality); discernment | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1290330 | 混血 | こんけつ | N1 | #1[n,adj-no,vs]sens: mixed race; mixed parentage | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1291410 | 差別 | さべつ | N3 | #1[n,vs,vt]: distinction; differentiation; discrimination || #2[n,vs,vt]: discrimination (against people) | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1294110 | 最盛期 | さいせいき | - | #1[n]: golden age; prime; heyday || #2[n]: season (for fruit, vegetables, etc.); best time | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1295830 | 菜 | な | - | #1[n]: greens; vegetables || #2[n]: rape (Brassica napus); rapeseed | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1296560 | 在日 | ざいにち | - | #1[adj-f,n,vs,vi]: resident in Japan (of a foreigner); situated in Japan (e.g. of an embassy) || #2[n]abbr/sens: Zainichi; Zainichi Korean; North or South Korean national with permanent residency in Japan (who came to the country before 1945, or a descendant of such a person) | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1298180 | 搾乳 | さくにゅう | - | #1[n,vs,vt,vi]: milking (a cow, goat, etc.) || #2[n,vs,vt,vi]: breast pumping; milk expression | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1307770 | 子 | こ | N4 | #1[n,n-suf]: child; kid; teenager || #2[n,n-suf]: (one's) child; offspring || #3[n,n-suf]: young woman || #4[n,n-suf]: young (animal) || #5[n]: offshoot || #6[n]: interest || #7[n]abbr: new share || #8[n]: player who is not a dealer || #9[n]: young geisha; young prostitute || #11[n-suf]: -er (often … | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1317400 | 自衛 | じえい | N2 | #1[n,vs,vt,vi,adj-no]: self-defense; self-defence | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1317410 | 自衛隊 | じえいたい | - | #1[n]: Japan Self-Defense Forces; JSDF || #2[n]: self-defence force; self-defense force | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1319160 | 識別 | しきべつ | - | #1[n,vs,vt]: distinction; discrimination; discernment | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1322270 | 射精 | しゃせい | - | #1[n,vs,vi]: ejaculation | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1322860 | 社交 | しゃこう | N1 | #1[n,adj-no]: social life; social intercourse | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1326160 | 主婦 | しゅふ | N3 | #1[n]: housewife; mistress (of the house); homemaker | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1328220 | 手当たり次第 | てあたりしだい | - | #1[adv,exp]: using anything one can lay one's hands on; haphazardly; on the rebound | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1328820 | 種 | たね | N3 | #1[n]: seed (e.g. of a plant); pip; kernel || #2[n]: progeny; offspring; issue || #3[n]: paternal blood; lineage || #4[n]: sperm; semen; seed || #5[n]: cause; source; seed || #6[n]: material (e.g. for an article); matter (e.g. of a story); subject (of discussion) || #7[n]: ingredient; main ingredien… | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1337350 | 淑女 | しゅくじょ | - | #1[n]: lady || #2[n]net-sl: (female) pervert | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1340450 | できる | できる | N5 | #1[v1,vi]uk: to be able to do; to be possible; to be permitted (to do) || #2[v1,vi]uk: to be good at; to do well; to be proficient (in) || #3[v1,vi]uk: to come into existence; to form; to appear || #4[v1,vi]uk: to be made; to be built; to be constructed || #5[v1,vi]uk: to be finished; to be complete… | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1341000 | 春 | はる | N5 | #1[n,adv]: spring; springtime || #2[n]: New Year || #3[n]: prime (of life); height (of one's prosperity); heyday || #4[n]: adolescence; puberty || #5[n]: sexuality; sexual desire | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1344930 | 女 | おんな | N5 | #1[n,n-pref]: woman; female || #2[n]: female lover; girlfriend; mistress | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1345370 | 女中 | じょちゅう | - | #1[n]dated/sens: maidservant; housemaid; maid || #2[n]sens: hostess (in a ryokan); waitress (in a traditional restaurant) | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1351280 | 笑い | わらい | N3 | #1[n]: laugh; laughter || #2[n]: smile || #3[n]: sneer || #4[n]: sex aids (e.g. dildos, pornographic books, erotic woodblock prints, etc.) | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1352150 | 上 | かみ | N3 | #1[n]: upper reaches (of a river); upper stream || #2[n]: top; upper part; upper half (of the body) || #3[n]: long ago || #4[n]: beginning; first || #5[n]hon: person of high rank (e.g. the emperor) || #6[n]: government; imperial court || #7[n]: imperial capital (i.e. Kyoto); capital region (i.e. Kan… | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1352290 | 上がる | あがる | N4 | #1[v5r,vi]: to rise; to go up; to come up || #2[v5r,vi]: to enter (esp. from outdoors); to come in; to go in || #3[v5r,vi]: to enter (a school); to advance to the next grade || #4[v5r,vi]: to get out (of water); to come ashore; to be washed ashore || #5[v5r,vi]: to float atop the water; to surface f… | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1357670 | 色気 | いろけ | - | #1[n]: colouring; coloring; shade of colour (color) || #2[n]: sex appeal (esp. of women); sexiness; sexual allure || #3[n]: interest in the opposite sex; sexual feelings; sexual urge || #4[n]: charm; elegance; romance || #5[n]: feminine presence || #6[n]: desire; interest; ambition | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1358760 | 尻 | しり | N3 | #1[n]: buttocks; behind; rump || #2[n]: undersurface; bottom || #3[n]: last place; end || #4[n]: consequence | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1360010 | 寝る | ねる | N5 | #1[v1,vi]: to sleep (lying down) || #2[v1,vi]: to go to bed; to lie in bed || #3[v1,vi]: to lie down || #4[v1,vi]: to sleep (with someone, i.e. have intercourse) || #5[v1,vi]: to lie flat (e.g. of hair) || #6[v1,vi]: to lie idle (of funds, stock, etc.) || #7[v1,vi]: to ferment (of soy sauce, miso, e… | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1365410 | 親友 | しんゆう | N3 | #1[n]: close friend; bosom friend; buddy | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1372410 | 粋 | いき | N1 | #1[adj-na,n]: chic; smart; stylish || #2[adj-na,n]: understanding; considerate; thoughtful || #3[adj-na,n]: familiar with worldly pleasures (esp. sexual relations, geisha districts and red-light districts) | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1375260 | 性 | せい | N3 | #1[n]: nature (of a person) || #2[n]: sex; gender || #3[n]: sex (i.e. sexual attraction, activity, etc.) || #4[n]: gender || #5[n-suf]: -ty; -ity; -ness | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1375320 | 性教育 | せいきょういく | - | #1[n]: sex education | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1375330 | 性交 | せいこう | - | #1[n,vs,vi]: sexual intercourse; sex; coitus | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1375430 | 性的 | せいてき | - | #1[adj-na]: sexual (i.e. relating to biological sex) || #2[adj-na]: sexual (relations, attraction, abuse, etc.) | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1375490 | 性病 | せいびょう | - | #1[n]: sexually transmitted disease; STD; sexually transmitted infection | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1375510 | 性癖 | せいへき | - | #1[n]: disposition; inclination; characteristic || #2[n]col: sexual disposition; fetish | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1375520 | 性別 | せいべつ | N2 | #1[n]: (distinction of) sex; gender | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1375540 | 性欲 | せいよく | - | #1[n]: sexual desire; sex drive; lust | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1378450 | 生 | なま | N3 | #1[adj-no,n]: raw; uncooked; fresh || #2[adj-no,n]: natural; as it is; unedited || #3[adj-no,n]col: unprotected (sex); raw; bareback || #4[adj-no,n]: live (i.e. not recorded) || #5[adj-no,n]: inexperienced; unpolished; green || #6[n]abbr: impudence; sauciness || #7[n]abbr: unpasteurized beer; draft … | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1379640 | 盛り | さかり | N3 | #1[n,n-suf]: height (e.g. of summer); peak (e.g. of cherry blossom season); (in) season || #2[n,n-suf]: prime (of one's life); (one's) best days; bloom || #3[n]: (being in) heat; rut | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1379730 | 盛る | さかる | N1 | #1[v5r,vi]: to become vigorous; to gain force; to become more active || #2[v5r,vi]dated: to prosper; to thrive; to flourish || #3[v5r,vi]: to be in heat; to be in rut; to copulate | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1379850 | 精 | せい | - | #1[n]: spirit; sprite; nymph || #2[n]: energy; vigor (vigour); strength || #3[n]: fine details || #4[n]: semen | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1379890 | 精液 | せいえき | - | #1[n]: semen; seminal fluid; sperm | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1379940 | 精子 | せいし | - | #1[n]: sperm; spermatozoon | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1380020 | 精神薄弱 | せいしんはくじゃく | - | #1[n]dated/sens: feeble-mindedness; intellectual disability | inactive | 精神薄弱 — 지적장애를 가리키던 구식 차별적 임상 용어(현재 知的障害로 대체됨), dated/sens 태그 |
| 1380100 | 精通 | せいつう | - | #1[n,vs,vi]: being well versed (in); being well acquainted (with); being familiar (with) || #2[n,vs,vi]: (a boy's) first ejaculation; spermarche; semenarche | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1386930 | 絶頂 | ぜっちょう | - | #1[n]: top (of a mountain); summit || #2[n]: peak; height; zenith || #3[n,vs,vi]col: orgasm; climax | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1392580 | 前 | まえ | N5 | #1[n]: in front (of); before (e.g. a building) || #2[n,adj-no,adv]: before; earlier; previously || #3[n,adj-no]: (the) front; frontal part; fore || #4[n]: forward; ahead || #5[n]: (in the) presence (of); in front (of someone) || #6[adj-no]: previous (e.g. page); prior (e.g. engagement); first (e.g. … | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1397120 | 粗野 | そや | - | #1[adj-na,n]: rustic; rude; vulgar | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1397270 | 素人 | しろうと | N2 | #1[n]: amateur; layman; ordinary person || #2[n]: respectable woman (i.e. not a prostitute, hostess, geisha) | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1399840 | 挿入 | そうにゅう | - | #1[n,vs,vt]: insertion; interposition; interpolation || #2[n]: interpolation || #3[n]: infix | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1404390 | 息子 | むすこ | N4 | #1[n]: son || #2[n]col: penis | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1405100 | 俗 | ぞく | - | #1[n]: layman (esp. as opposed to a Buddhist monk); laity; man of the world || #2[n]: local manners; modern customs || #3[adj-na,adj-no]: common; popular || #4[adj-na,adj-no]: vulgar; low | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1405300 | 俗語 | ぞくご | - | #1[n]: colloquialism; colloquial language; slang | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1408270 | 太もも | ふともも | - | #1[n]: thigh || #2[n]col: buttocks; arse; ass | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1416280 | だるま | だるま | - | #1[n]uk: daruma; tumbling doll; round, red-painted good-luck doll in the shape of Bodhidharma, with a blank eye to be completed when a person's wish is granted || #2[n]uk: Bodhidharma || #3[n]uk: prostitute | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1416740 | 谷間 | たにま | - | #1[n]: valley; ravine; gorge || #2[n]: cleavage (of breasts) || #3[n]: part or place that has been left behind; blind spot; bottom (of society) | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1418410 | 旦那 | だんな | N1 | #1[n]: master (of a house, shop, etc.) || #2[n]fam: husband || #3[n]: sir; boss; master || #4[n]: patron of a mistress, geisha, bar or nightclub hostess; sugar daddy || #5[n]: alms; almsgiving; almsgiver | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1421710 | 痴漢 | ちかん | - | #1[n]: molester; groper; masher | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1421750 | 痴呆 | ちほう | - | #1[n]sens: dementia || #2[n]: stupidity; foolishness; fool | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1422000 | 遅らす | おくらす | N1 | #1[v5s,vt]: to delay; to postpone; to slow down | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1422200 | ちくしょう | ちくしょう | N1 | #1[int]uk: damn it; damn; son of a bitch || #2[n]: beast; animal || #3[n]: person reborn into the animal realm || #4[n]: brute; bastard | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1426100 | 仲良し | なかよし | N2 | #1[n,adj-no]: close friendship; close friend; good friend || #2[n,vs,vi]euph/col: intimate relations; sexual intercourse; sex | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1428230 | 挑む | いどむ | N1 | #1[v5m,vt]: to challenge to (a fight, game, etc.); to throw down the gauntlet; to contend for || #2[v5m,vi]: to tackle (e.g. a problem); to attempt; to go after (a prize, record, etc.) || #3[v5m,vi]: to pressure (someone) for sex; to make advances to | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1435450 | 定額 | ていがく | - | #1[n]: fixed amount (of money); fixed sum; flat sum | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1446760 | 島 | しま | N4 | #1[n]: island || #2[n]uk: one's territory (of a sex worker, organized crime gang, etc.); one's turf | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1450030 | 豆 | まめ | N3 | #1[n]: legume (esp. edible legumes or their seeds, e.g. beans, peas, pulses); bean; pea || #2[n]: soya bean (Glycine max); soybean; soy || #3[n]col: female genitalia (esp. the clitoris) || #4[n]col/uk: kidney || #5[pref]: small; miniature; baby || #6[pref]: child | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1451110 | 働き盛り | はたらきざかり | - | #1[n]: prime of one's working life | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1451900 | 同一 | どういつ | N3 | #1[adj-no,adj-na]: identical; same; one and the same || #2[adj-no,adj-na]: fair; equal treatment; without discrimination | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1452870 | 同性 | どうせい | - | #1[n,adj-no]: same sex | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1452880 | 同性愛 | どうせいあい | - | #1[n,adj-no]: homosexuality; homosexual love | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1457290 | 酉 | とり | - | #1[n]: the Rooster (tenth sign of the Chinese zodiac); the Cock; the Chicken | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1461750 | 二号 | にごう | - | #1[n]: number two || #2[n]: mistress; concubine | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1463560 | 肉眼 | にくがん | - | #1[n]: naked eye || #2[n]: the physical eye | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1464980 | 乳 | ちち | N1 | #1[n]: milk || #2[n]: breast || #3[n]: loop || #4[n]: decorative bump (on a hanging bell) | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1467640 | 猫 | ねこ | N5 | #1[n]: cat (esp. the domestic cat, Felis catus); feline || #2[n]: shamisen || #3[n]: geisha || #4[n]abbr: wheelbarrow || #5[n]abbr: clay bed-warmer || #6[n]uk/sl: bottom (submissive partner of a homosexual relationship) | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1469840 | 悩ます | なやます | N1 | #1[v5s,vt]: to afflict; to torment; to harass | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1473620 | 買取 | かいとり | - | #1[n,vs,vt]: purchase; buying; buying out || #2[n,vs,vt]: buying used articles as a company; trade-in; buy back || #3[n,vs,vt]: purchase on a no-return policy || #4[n]: lump-sum payment; flat fee | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1473740 | 買う | かう | N5 | #1[v5u,vt]: to buy; to purchase || #2[v5u,vt]: to value (highly); to think highly of; to have a high opinion of || #3[v5u,vt]: to incur (someone's anger, displeasure, etc.); to elicit (e.g. sneers); to invite (e.g. scorn) || #4[v5u,vt]: to accept; to take on; to take up || #5[v5u,vt]: to pay for (a … | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1475240 | 白身 | しろみ | - | #1[n]: egg white || #2[n]: white-fleshed fish (e.g. tai, hirame, karei); white meat; fatty meat || #3[n]: sapwood | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1476480 | 肌色 | はだいろ | - | #1[n,adj-no]sens: flesh colour (of a Japanese person); flesh color; pale orange || #2[n]: (one's) skin color; skin colour; skin tone | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1477490 | 発射 | はっしゃ | N2 | #1[n,vs,vt]: firing (esp. a rocket or missile); launching; shooting || #2[n,vs,vt]sl: ejaculation | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1477720 | 発展 | はってん | N3 | #1[n,vs,vi]: development; growth; expansion || #2[n,vs,vi]: development (of a situation, story, etc.); advancement; progression || #3[n,vs,vi]: playing around (sexually; esp. of a male homosexual); having an active sex life | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1479770 | 半島 | はんとう | N2 | #1[n]: peninsula || #2[n]sens/col: Korea | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1481550 | 犯す | おかす | N1 | #1[v5s,vt]: to commit (e.g. crime); to perpetrate; to make (e.g. mistake) || #2[v5s,vt]: to break (e.g. rule); to violate; to transgress || #3[v5s,vt]: to rape; to violate; to ravish | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1482660 | 卑しい | いやしい | N1 | #1[adj-i]: lowborn; humble; lowly || #2[adj-i]: vulgar; coarse; crude || #3[adj-i]: shabby; poor-looking || #4[adj-i]: greedy; gluttonous; avaricious | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1484260 | 肥える | こえる | - | #1[v1,vi]: to grow fat; to gain weight; to put on weight || #2[v1,vi]: to grow fertile (of soil) || #3[v1,vi]: to be discerning (of one's palate, eye, ear, etc.); to be discriminating; to be refined || #4[v1,vi]: to become rich; to become wealthy | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1487970 | ひも | ひも | N3 | #1[n]uk: string; cord || #2[n]uk: leash || #3[n]uk/col: man who is financially dependent on a woman; gigolo; pimp || #4[n]uk: restrictions; conditions || #5[n]uk: mantle (shellfish, etc.) || #6[n]uk: small intestine (beef, pork); oviduct meat (chicken) | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1488160 | ゆり | ゆり | - | #1[n]uk: lily (Lilium spp.) || #2[n]col: yuri; genre of comics and novels about female homosexuality | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1488250 | 百姓 | ひゃくしょう | - | #1[n]sens: farmer; peasant; farm laborer || #2[n]: farming || #4[n]: the common people | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1492160 | 不潔 | ふけつ | N2 | #1[adj-na,n]: unclean; dirty; unsanitary || #2[adj-na,n]: indecent; dirty (story, money, etc.); obscene | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1495910 | 付け根 | つけね | - | #1[n]: root; joint; base | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1496670 | 婦人 | ふじん | N3 | #1[n]sens/dated: woman; lady; adult female | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1497450 | 浮気 | うわき | N1 | #1[n,adj-na,vs,vi]: extramarital sex; affair; fooling around || #2[n,adj-na,vs,vi]: infidelity; wantonness; unfaithfulness | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1499550 | 部落 | ぶらく | - | #1[n]sens: hamlet; subunit of village || #2[n]sens: burakumin area | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1499960 | 風俗 | ふうぞく | N1 | #1[n]: manners; customs || #2[n]: public morals || #3[n]: sex service; sex industry; sex-oriented entertainment | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1500110 | 風呂屋 | ふろや | - | #1[n]: public bathhouse || #2[n]sens: bathhouse proprietor | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1503000 | 分ける | わける | N3 | #1[v1,vt]: to divide (into); to split (into); to part || #2[v1,vt]: to share; to distribute; to deal out || #3[v1,vt]: to distinguish; to discriminate; to differentiate (between) || #4[v1,vt]: to break up (a fight); to mediate || #5[v1,vt]: to call a draw; to tie || #6[v1,vt]: to push one's way thro… | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1504200 | 分別 | ぶんべつ | - | #1[n,vs,vt]: separation (e.g. of rubbish when recycling); classification; discrimination | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1504900 | くそ | くそ | - | #1[int]uk: damn; damn it; shit || #2[n]col/uk: feces; excrement; dung || #3[pref]uk: damn; damned; blasted || #4[pref]uk: very; extremely; really || #5[adj-na]col/uk: terrible; awful; shit || #6[adv]sl/uk: a lot || #7[n]uk: negligible; insignificant; not mattering at all | inactive | くそ — "젠장/똥"류의 비속어·욕설, 표제어 전 sense 가 비속 표현(JLPT 없음) |
| 1507040 | 平泳ぎ | ひらおよぎ | - | #1[n]: breaststroke (swimming) | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1509430 | 別 | べつ | N4 | #1[n]: distinction; difference; discrimination || #2[adj-no,adj-na,n]: separate; different; another || #3[n]: exception; exclusion || #4[n-suf]: classified by; ranked by; according to | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1511120 | 変質 | へんしつ | - | #1[n,vs,vi]: alteration (of character or essence); change in quality; transformation || #2[n]: perversion (esp. sexual) | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1511350 | 変態 | へんたい | - | #1[n,vs,vi]: transformation || #2[n,adj-no]: abnormality || #3[n,adj-no]abbr: sexual perversion; pervert || #4[n,vs,vi]: metamorphosis || #5[n,vs,vi]: transformation; transition; modification | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1512720 | わきまえる | わきまえる | - | #1[v1,vt]uk: to discern (e.g. right from wrong); to discriminate; to distinguish || #2[v1,vt]uk: to know (manners, one's place, etc.); to understand; to bear in mind | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1518130 | 豊か | ゆたか | N3 | #1[adj-na,suf]: abundant; plentiful; rich || #2[adj-na]: rich; wealthy; affluent || #3[adj-na]: open (mind); relaxed; easy || #4[adj-na]: plump (e.g. breasts); full; ample || #5[suf,adj-na]: (well) over; (easily) in excess of | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1519460 | 暴行 | ぼうこう | - | #1[n,vs,vt,vi]: assault; outrage; act of violence || #2[n,vs,vt,vi]: rape (by force); sexual assault | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1521920 | 勃起 | ぼっき | - | #1[n,vs,vi]: erection (of the penis); becoming erect; stiffening || #2[n,vs,vi]: welling up (of an emotion) | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1529590 | むやみに | むやみに | N1 | #1[adv]uk: thoughtlessly; recklessly; rashly || #2[adv]uk: excessively; unreasonably; immoderately | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1529970 | 無差別 | むさべつ | - | #1[n]: indiscrimination; without discrimination || #2[adj-na]: indiscriminate | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1532980 | 滅多 | めった | - | #1[adj-na]: thoughtless; reckless; careless || #2[adj-na]: ordinary; usual; common || #3[pref]: excessive; indiscriminate | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1534340 | 盲目 | もうもく | - | #1[n,adj-no]: blindness || #2[adj-na,n]sens: blind (e.g. love, faith); reckless | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1537780 | やたら | やたら | N2 | #1[adv,adv-to]uk: indiscriminately; blindly; at random || #2[adj-na]uk: indiscriminate; random; excessive | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1547700 | 裸婦 | らふ | - | #1[n]: nude woman; female nude | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1548550 | 落ちる | おちる | N4 | #1[v1,vi]: to fall; to drop; to come down || #2[v1,vi]: to set (of the sun or moon); to sink; to dip || #3[v1,vi]: to decrease (of popularity, quality, speed, sales, etc.); to fall; to drop || #4[v1,vi]: to be inferior (to); to be not as good (as); to fall short (of) || #5[v1,vi]: to come off (of di… | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1549100 | 乱暴 | らんぼう | N2 | #1[n,adj-na,vs,vi]: violence; assault; rowdiness || #2[adj-na,n]: rough (handling, language, etc.); reckless; careless || #3[n,vs,vi]: rape; sexual assault | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1560120 | 露骨 | ろこつ | N1 | #1[adj-na,n]: open; unconcealed; undisguised || #2[adj-na,n]: broad; lewd; indecent | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1577100 | 何 | なに | N5 | #1[pn]: what || #2[pn]: you-know-what; that thing || #3[pn]: whatsit; whachamacallit; what's-his-name || #4[n]col/uk: penis; (one's) thing; dick || #5[adv]: (not) at all; (not) in the slightest || #6[int]: what?; huh? || #7[int]: hey!; come on! || #8[int]: oh, no (it's fine); why (it's nothing); oh … | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1577670 | メガネ | メガネ | N5 | #1[n]uk: glasses; eyeglasses; spectacles || #2[n]: judgment; judgement; discrimination | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1578850 | 行く | いく | N5 | #1[v5k-s,vi]: to go; to move (towards); to head (towards) || #2[v5k-s,vi]: to move through; to travel across; to walk along (e.g. a road) || #3[v5k-s,vi]: to go (well, badly, etc.); to proceed; to turn out || #4[v5k-s,vi]: to do (in a particular way); to go (with; a choice); to try || #5[v5k-s,vi]: … | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1580280 | 小便 | しょうべん | N2 | #1[n,vs,vi]: urine; piss; pee || #2[n,vs,vi]col: breaking a contract | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1582050 | 天神 | てんじん | - | #1[n]: heavenly god; heavenly gods || #2[n]: spirit of Sugawara no Michizane || #3[n]: Tenmangu shrine (dedicated to Michizane's spirit) || #4[n]col: pit of a dried plum; dried plum || #5[n]abbr: tenjin hairstyle || #6[n]: prostitute of the second-highest class (Edo period) || #7[n]: tuning peg (on … | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1582730 | 乳首 | ちくび | - | #1[n]: nipple; teat | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1582760 | 乳房 | ちぶさ | - | #1[n]: breast; udder | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1582970 | 売春婦 | ばいしゅんふ | - | #1[n]: prostitute | inactive | 売春婦 — 매춘부, 성매매 여성을 가리키는 직업명 단일 sense |
| 1584760 | 盲 | めくら | - | #1[n,adj-no]sens: blindness; blind person || #2[n]sens: illiteracy; illiterate person || #3[n]sens: ignorance; ignorant person | inactive | 盲(めくら) — 시각장애인/문맹을 비하하는 일본어 방송금지 차별어 |
| 1585360 | 歪む | ゆがむ | N1 | #1[v5m,vi]: to warp; to bend; to contort || #2[v5m,vi]: to be perverted; to be warped (of a view, mind, etc.); to be distorted | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1585440 | せがれ | せがれ | N1 | #1[n]uk/hum: son || #2[n]uk: punk; brat || #3[n]uk/col: penis | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1595000 | 娼婦 | しょうふ | - | #1[n]: prostitute | inactive | 娼婦 — 창녀, 매춘 여성을 가리키는 명칭 단일 sense |
| 1596180 | 浅見 | せんけん | - | #1[n]form: shallow view; superficial idea || #2[n]hum: (one's) view; (one's) humble opinion | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1597040 | 立つ | たつ | N5 | #1[v5t,vi]: to stand (up); to rise; to get to one's feet || #2[v5t,vi]: to stand (in a position; of a person, tree, building, etc.); to be situated (in, on) || #3[v5t,vi]: to be (in difficulties, the lead, etc.); to put oneself (in a position or situation); to take up (a position, post, etc.) || #4[… | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1598750 | 年寄り | としより | N3 | #1[n,adj-no]sens: old person; elderly person; senior citizen || #2[n]: trustee of the Japan Sumo Association; retired high-ranking wrestler who is licensed to coach and receives retirement pay || #3[n]: senior statesman (of the Tokugawa shogunate) || #4[n]: important local official (under the Tokuga… | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1601240 | 売春 | ばいしゅん | - | #1[n,vs,vi]: prostitution | inactive | 売春 — 매춘(성매매) 행위 자체를 가리키는 단일 sense |
| 1601260 | ばか | ばか | N3 | #1[n]uk: idiot; moron; fool || #2[adj-na]uk: stupid; foolish; dull || #3[n,adj-na]uk: trivial; insignificant; disappointing || #4[n,adj-na]uk: malfunctioning; defective; losing sensation || #5[n,n-pref]uk/sl: incredibly; unusually; exceptionally || #6[n,n-suf,adj-na]uk/sl: fervent enthusiast; nut; p… | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1604890 | 目 | め | N5 | #1[n]: eye; eyeball || #2[n]: eyesight; sight; vision || #3[n]: look; stare; gaze || #4[n]: notice; attention; observation || #5[n]: an experience || #6[n]: viewpoint || #7[n]: discrimination; discernment; judgement || #8[n]: (an) appearance || #9[n]: chance (of success); possibility (of a good resu… | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1605620 | やり直す | やりなおす | - | #1[v5s,vt]: to do over again; to redo; to start over | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1606200 | 乱獲 | らんかく | - | #1[n,vs,vt]: overfishing; overhunting; indiscriminate fishing | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1606520 | 分かち | わかち | - | #1[n]: distinction; differentiation; discrimination | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1607020 | 割れ目 | われめ | - | #1[n]: crack; crevice; split | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1609430 | 落ちこぼれ | おちこぼれ | - | #1[n]: fallen scraps; scatterings || #2[n]: leftovers; remainder; pickings || #3[n,adj-no]col/sens: student who cannot keep up in school; dropout (from school, society, a movement, etc.) | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1611190 | はしたない | はしたない | - | #1[adj-i]uk: improper; immodest; disgraceful | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1613890 | 海上自衛隊 | かいじょうじえいたい | - | #1[n]: Maritime Self Defense Forces (Defence) | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1628360 | 援助交際 | えんじょこうさい | - | #1[n,vs,vi]: paid dating (esp. with an underage girl; oft. involving selling of sex); compensated dating | inactive | 援助交際 — 미성년자 대상 원조교제(성매매 성격의 보상 데이트), 아동 성착취 인접 개념 |
| 1631330 | 航空自衛隊 | こうくうじえいたい | - | #1[n]: Japan Air Self-Defense Force; JASDF | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1644330 | 陸上自衛隊 | りくじょうじえいたい | - | #1[n]: Japan Ground Self-Defense Force; JGSDF | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1658510 | 自衛官 | じえいかん | - | #1[n]: Japanese Self-Defense Force official; Self-Defense Force official | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1659120 | 受け | うけ | - | #1[n,n-suf]: popularity; favour; favor || #2[n]: defense; defence; reputation || #3[n]: agreement || #4[n]: receiver of technique (e.g. in martial arts) || #5[n]uk/sl: bottom (submissive partner of a homosexual relationship) | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 1729000 | 豊胸 | ほうきょう | - | #1[n]: full breasts; ample breasts || #2[n]: breast enlargement | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1827400 | 肉体的 | にくたいてき | - | #1[adj-na]: bodily; physical; corporeal || #2[adj-na]: sexual; sensual; of the flesh | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 1854880 | 売り | うり | - | #1[n,n-suf]: sale; selling || #2[n]: selling point; gimmick || #3[n-suf]: seller; vendor || #4[n,vs]col: prostitution | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 2000350 | 婦女暴行 | ふじょぼうこう | - | #1[n]: sexual assault (of a woman); rape | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 2080210 | 下 | しも | N3 | #1[n]: lower reaches (of a river) || #2[n]: bottom; lower part || #3[n]: lower half (of the body, esp. the privates); feces (faeces); urine || #4[n]: end; far from the imperial palace (i.e. far from Kyoto, esp. of western Japan) || #5[adj-no]: dirty (e.g. dirty jokes, etc.) | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 2083540 | 小 | しょう | N3 | #1[n,n-pref]: smallness; small item || #2[n]abbr: short month (i.e. having fewer than 31 days) || #3[n]abbr: urine; piss; pee || #4[n,n-pref]abbr: elementary school || #5[n-pref]: smaller (of two things, places, etc. with the same name); inferior || #6[n-pref]: younger (of two people with the same n… | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 2714050 | 飢え死に | うえじに | - | #1[n,vs,vi]sens: (death from) starvation; starving to death | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 2838553 | のろい | のろい | N2 | #1[adj-i]uk: thickheaded; obtuse; stupid || #2[adj-i]uk: slow; sluggish; inert || #3[adj-i]uk: indulgent (esp. to the opposite sex); doting | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 2844997 | 抱く | だく | - | #1[v5k,vt]: to hold in one's arms (e.g. a baby); to embrace; to hug || #2[v5k,vt]: to have sex with; to make love to; to sleep with || #3[v5k,vt]: to sit on (eggs); to brood | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 2851269 | 新築マンション | しんちくマンション | - | #1[n]: newly built apartment house; newly built condominium | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
| 2863845 | かり | かり | - | #1[n]uk: wild goose || #2[n]uk/abbr/col: glans; head of a penis | keep_but_sense | 특정 sense만 해당(주 의미는 정상) — 참고용, is_active 변경 없음 |
| 2871349 | モテ | モテ | - | #1[n-pref,n]col/uk: being popular (esp. with the opposite sex); being well-liked | keep | 일반/의학·중립 어휘이거나 표제어와 무관한 매칭(오탐) |
