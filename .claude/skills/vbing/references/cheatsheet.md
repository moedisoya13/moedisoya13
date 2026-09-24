# 파이썬 데이터 시각화 Cheat Sheet
> Matplotlib & Seaborn — 함수별 핵심 명령어 색인

## 목차
- **Chapter 1. 기본 그래프**
  - 01-2. 기본 그래프 그리기
  - 01-3. 목적에 따른 여러가지 그래프
- **Chapter 2. 그래프 스타일 설정**
  - 02-1. 한글폰트사용, 색상, 마커, 선
  - 02-2. 제목, 축 레이블, 그리드
  - 02-3. 축의 범위와 눈금 지정
  - 02-4. 여러개의 그래프와 범례
- **Chapter 3. 서브플롯 (Subplot)**
  - 03-1. pyplot으로 서브플롯 그리기 - plt.pyplot
  - 03-2. 위치, 크기 지정하여 플롯 그리기 - add_axes
  - 03-3. axes를 행,열로 쪼개어 서브플롯 그리기- subplots
  - 03-4. 전체 행 열과 그래프 순서에 따라 서브플롯 그리기 - add_subplot
- **Chapter 4. 비교 · 관계 그래프**
  - 04-1. 데이터의 크기를 비교하는 막대그래프
  - 04-2. 데이터의 관계를 표현하는 산점도
  - 04-3. 색으로 값의 크기를  표현하는 히트맵
- **Chapter 5. 분포 그래프**
  - 05-1. 데이터의 도수분포를 표현하는 히스토그램
  - 05-2. 데이터의 통계값을 표현하는 박스플롯
  - 05-3. 데이터의 범위와 분포를 표현하는 바이올린플롯
  - 05-4. 데이터의 비율을 표현하는 파이차트
- **Chapter 6. 그래프 꾸미기**
  - 06-1. 공통 스타일 지정하기
  - 06-2. 그래프 강조하기-영역채우기
  - 06-3. 그래프 강조하기-수직선과수평선
  - 06-4. 그래프에 설명적기-text, annotation
  - 06-5. 2중 y축 표시하기
- **Chapter 7. Seaborn**
  - 07-1. Seaborn - 막대그래프(barplot)
  - 07-2. Seaborn - scatterplot
  - 07-3. Seaborn-lineplot
  - 07-4. Seaborn - 데이터의 분포를 나타내는 여러가지 그래프
- **Chapter 11. 실전 프로젝트**
  - 11-0. 지역별 인구구조 시각화

---

---

## Chapter 1. 기본 그래프

### 01-2. 기본 그래프 그리기
#### 기본 그래프 그리기
plt.plot(data)
plot에 데이터를 전달하여 그린다.
##### y축 데이터로 그리기
1차원 리스트, 튜플, 시리즈 데이터를 전달하여 그린다.
x축은 데이터의 인덱스로 자동 지정된다.
plt.plot(data)
plt.plot(s)
##### x축, y축 데이터로 그리기
x축과 y축 데이터의 길이가 같아야 한다.
plt.plot(x,y)
plt.plot(s.index, s)

### 01-3. 목적에 따른 여러가지 그래프
##### 선그래프
plt.plot(age, height)
##### 막대 그래프
plt.bar(blood_type,count)
##### 가로 막대 그래프
plt.barh(blood_type,count)
##### 파이차트
pie
plt.pie(count, labels=blood_type)
plt.show()
##### 히스토그램
plt.hist(data, bins=100)
plt.show()
##### 상자수염그래프
boxplot
plt.boxplot(data)
plt.show()
##### 바이올린그래프
violinplot
plt.violinplot(data)
plt.show()
##### 산점도
scatter
plt.scatter(tips['total_bill'], tips['tip'])

---

## Chapter 2. 그래프 스타일 설정

### 02-1. 한글폰트사용, 색상, 마커, 선
#### 한글폰트 사용
plt.rcParams['font.family'] = 'Malgun Gothic'
##### 색상
color=색상
색상 이름을 사용한다.
자주 사용되는 색깔은 약자를 사용할 수 있다.(blue:b, green:g, red:r, cyan:c, magenta:m, yellow:y, black:k, white:w)
hex code를 사용할 수 있다.
plt.plot(x,y,color='skyblue')
##### 마커
marker : 마커종류 (* . , o v ^ < > 1 2 3 4 s p * h H + x D d)
markersize, ms : 마커사이즈
markeredgecolor, mec : 마커 선 색깔
markeredgewidth, mew : 마커 선 굵기
markerfacecolor, mfc : 마커 내부 색깔
plt.plot(x,y,color='#A566FF', marker='D', ms='10', mec='b', mew='3', mfc='y')
##### 선
linestyle, ls : 선스타일
``'-'``          solid line style
``'--'``         dashed line style
``'-.'``         dash-dot line style
``':'``          dotted line style
linewidth, lw : 선 굵기
plt.plot(x,y,color='#A566FF', marker='D', ms='10', mec='b', mew='3', mfc='y'
        ,ls=':', lw=3)
##### [색상][마커][선]
[color][marker][line]
plt.plot(x,y,'k')
plt.plot(x,y,'o')
plt.plot(x,y,'--')
plt.plot(x,y,'ro')
plt.plot(x,y,'y--')
plt.plot(x,y,'*:')
plt.plot(x,y,'g*:', ms=10, mec='r', mfc='k', lw=3)

### 02-2. 제목, 축 레이블, 그리드
#### 제목
plt.title('제목')
loc : 제목 위치('left','center','right')
pad : 타이틀과 그래프와의 간격
color : 폰트색상
fontsize : 폰트사이즈
fontweight : 폰트굵기('normal','bold','heavy','light','ultrabold','ultralight')
fontfamily : 폰트
plt.title('월별 몸무게 변화', loc='center', pad=10, color='r', fontsize=20, fontweight='bold'
          , fontfamily='Nanum Pen Script')
plt.show()
#### x축, y축 레이블
plt.xlabel('레이블')
plt.ylabel('레이블')
loc : 위치('left','center','right' / 'bottom', 'center','top')
labelpad : 레이블과 그래프와의 간격
color : 폰트색상
fontsize : 폰트사이즈
fontfamily : 폰트
plt.xlabel('월',loc='right',labelpad=10, color='b',fontsize=12)
plt.ylabel('몸무게(kg)', loc='top',labelpad=10, color='b', fontsize=12)
plt.show()
#### 그리드
plt.grid(True)
axis : 그리드 방향
ls, lw, color, alpha 등의 속성을 지정할 수 있음
##### 기본 그리드
plt.grid()
plt.grid()
plt.show()
##### x축 그리드
plt.grid(axis='x')
plt.show()
##### y축 그리드
plt.grid(axis='y')
plt.show()
##### 그리드 스타일링
plt.grid(color='skyblue', alpha=0.5, ls=':')
plt.show()

### 02-3. 축의 범위와 눈금 지정
#### 축의 범위 지정하기
plt.xlim(min,max)
plt.ylim(min,max)
plt.xlim(1,12)
plt.ylim(0,100)
plt.show()
#### 틱 설정
x축, y축 눈금을 틱(tick)이라고 한다.
틱의 갯수, 레이블, 스타일을 변경할 수 있다.
##### 틱 지정
plt.xticks(틱리스트)
plt.yticks(틱리스트)
plt.plot(x,y,'bo-', mfc='r',mec='r')
plt.title('월별 몸무게 변화', size=15, color='b', fontweight='bold')
plt.xlabel('월')
plt.ylabel('몸무게(kg)')
plt.xticks(range(0,14,1))
plt.yticks(range(0,110,10))
plt.grid(ls=':')
##### 틱 레이블 지정
plt.xticks(눈금리스트, label = 레이블리스트)
plt.yticks(눈금리스트, label = 레이블리스트)
눈금의 개수와 동일한 개수의 레이블을 지정한다.
plt.xlabel('월')
plt.ylabel('몸무게(kg)')
plt.show()
##### 틱 스타일 지정
plt.tick_params( )
direction : 틱 위치 (in, out, inout)
length : 틱의 길이
width : 틱의 두께
color : 틱 색상
labelcolor : 틱 레이블 색상
colors : 틱과 틱 레이블 색상
pad : 틱과 레이블 사이의 거리
labelsize : 틱 레이블 사이즈
axis : 축 지정

### 02-4. 여러개의 그래프와 범례
##### 여러 개의 그래프 각각 그리기
plt.show()로 그래프를 구분한다.
plt.plot(df1['월'],df1['몸무게'])
##### 데이터가 다른 두 그래프 그리기
plt.show()를 마지막에 한번만 사용한다.
plt.plot(df1['월'],df1['몸무게'])
plt.title('월별 몸무게 변화', size=15)
plt.xlabel('월', fontsize=12)
plt.ylabel('몸무게(kg)', fontsize=12)
plt.xticks(range(0,14,1), labels=xtick_label)
plt.yticks(range(30,95,5), labels=ytick_label)
plt.grid(ls=':')
##### 범례 표시하기
여러 개의 플롯을 동시에 그리는 경우 각 그래프가 무엇을 표시하는지 보여주기 위해 범례를 추가한다.
1) 그래프에 레이블을 지정한다.(label=그래프명)
2) 범례를 표시한다. --> plt.legend()
범례의 위치는 그래프에 따라 최적의 위치에 자동으로 표시된다.
plt.legend()
plt.show()
plt.legend(loc=위치번호)
plt.legend(loc=위치이름)
Location String   Location Code
===============   =============
'best'            0
'upper right'     1
'upper left'      2
'lower left'      3
'lower right'     4
'right'           5
'center left'     6
'center right'    7
'lower center'    8
'upper center'    9
'center'          10
plt.legend(loc=(x위치,y위치)) : 범례의 왼쪽 하단이 기준점.
plt.legend(loc=1)
plt.show()
plt.legend(loc='center')
plt.show()
loc=(x,y)
왼쪽 아래 꼭지점 기준
plt.legend(loc=(1.01,0.8))
plt.show()
열 개수 : plt.legend(ncol=열개수)
폰트 사이즈 : plt.legend(fontsize=폰트사이즈)
테두리 : plt.legend(frameon=True/False)
음영 : plt.legend(shadow=True/False)
바탕색 : plt.legend(facecolor=색상)
테두리색 : plt.legend(edgecolor=색상)
plt.legend(ncol=2,fontsize=12,shadow=True,facecolor='ivory',edgecolor='k')
plt.show()

---

## Chapter 3. 서브플롯 (Subplot)

### 03-1. pyplot으로 서브플롯 그리기 - plt.pyplot
#### 데이터 불러오기
seaborn 라이브러리에서 제공하는 anscombe 데이터 사용
4가지 데이터를 각각의 데이터프레임으로 만들기
데이터 확인하기
#### 데이터의 통계수치 확인
데이터프레임.describe()
4개의 데이터는 갯수, 평균, 표준편차가 모두 같다.
이러한 수치만 보고 4개의 데이터 그룹의 데이터가 모두 같을 것이라고 착각할 수 있다.
#### 데이터 시각화
plt.plot(df1['x'],df1['y'],'o')
#### 서브플롯 그리기
1) 전체 그래프의 크기를 정한다. (정하지 않으면 디폴트 크기로 지정된다.)
<b>`plt.figure(figsize=(x사이즈, y사이즈))`</b>
2) 그래프를 그려 넣을 격자를 지정한다.(전체행개수,전체열개수,그래프순서)
<b>`plt.subplot(전체행개수,전체열개수,그래프순서`</b>
3) 격자에 그래프를 하나씩 추가한다.
plt.subplot(221)
##### 전체 그래프의 속성 지정
figure 객체를 변수에 받는다.
figure객체의 suptitle(제목)메소드로 전체 그래프의 제목을 표시한다.
figure객체의 tight_layout()메소드로 그래프의 간격, 너비를 최적화한다.
plt.subplot(221)
plt.plot(df1['x'],df1['y'],'o')
plt.title('ax1')
fig.suptitle('Amscombe', size=20)
fig.tight_layout()

### 03-2. 위치, 크기 지정하여 플롯 그리기 - add_axes
##### figure, axes
figure : 그림이 그려지는 캔버스
axes : 하나의 그래프
<img src= "attachment:image-2.png" width="200px" height="100px"></img>
##### 위치, 크기 지정하여 그래프 그리기
1) figure 객체를 생성한다.
<b>`fig = plt.figure(figsize=(가로길이,세로길이))`</b>
2) figure객체의 add_axes 메소드로 위치와 크기를 지정하여 axes 객체를 생성한다.
<b>`ax1 = fig.add_axes([left, bottom, width, height])`</b>
<span style="color:red">left, bottom</span> : 상대적인 시작 위치 (figsize의 크기를 1이라고 했을 때 상대적 위치)
<span style="color:blue">width, height</span> : 상대적인 크기(figsize의 크기를 1이라고 했을 때 상대적 크기)
<img src= "attachment:image.png" width="400px" height="300px"></img>
3) axes에  그래프를 그린다.
<b>`ax1.plot(x,y)`</b>
4) axes에  제목 추가.
<b>`ax1.set_title(제목)`</b>
add_axes를 사용하면, 서브플롯의 크기와 위치를 자유롭게 지정할 수 있다.
그래프를 겹쳐그리거나, 크기가 각각 다른 그래프를 그릴 수 있다.

### 03-3. axes를 행,열로 쪼개어 서브플롯 그리기- subplots
#### axes를 행, 열로 쪼개어 서브플롯 그리기
plt.subplots() 함수를 호출하면 figure, axes 객체를 생성하여 튜플 형태로 반환한다.
<b>`fig, ax = plt.subplots()`</b>
1) axes 객체를 행,열로 쪼개어 생성하기
<b>`fig, ax = plt.subplots(nrows=행개수, ncols=열개수,figsize=(가로사이즈,세로사이즈))`</b>
2) axes[행번호][열번호] 형태로 접근하여 그래프 그리기
<img src= "attachment:image.png" width="200px" height="150px"></img>
3) 서브플롯간 축을 공유할 수 있다.
<b>`sharex=True, sharey=True`</b>

### 03-4. 전체 행 열과 그래프 순서에 따라 서브플롯 그리기 - add_subplot
#### 전체 행 열과 그래프 순서에 따라 서브플롯 그리기
1) figure 객체를 생성한다.
<b>`fig=plt.figure()`</b>
2) 서브플롯을 그릴 axes 객체를 생성한다.
<b>`ax = fig.add_subplot(전체행개수,전체열개수,순서)`</b>
<img src= "attachment:image.png" width="200px" height="150px"></img>
3) axes 객체에 그래프를 그린다.
<b>`ax.plot(x,y)`</b>
4) 축 공유하기 :  어떤 axes의 축을 공유할 것인지 지정한다.
<b>`sharex=axes객체, sharey=axes객체`
#### 이미지로 그래프 저장하기
fig.savefig(파일명, dpi=해상도)
해상도 default : 100
fig.savefig('img150.png', dpi=150)

---

## Chapter 4. 비교 · 관계 그래프

### 04-1. 데이터의 크기를 비교하는 막대그래프
#### 막대그래프
plt.bar(x축데이터,y축데이터)
plt.barh(x축데이터,y축데이터)
##### 세로 막대 그래프
plt.bar(df1['요일'],df1['매출액'])
##### 가로 막대 그래프
plt.barh(df1['요일'],df1['매출액'])
##### 세로 막대 그래프
width = 0~1사이의 실수(default:0.8)
plt.bar(df1['요일'],df1['매출액'], width=0.4)
##### 가로막대 그래프
height = 0~1사이의 실수(default:0.8)
plt.barh(df1['요일'],df1['매출액'],height=0.4)
#### 막대 색상 지정
##### 막대마다 다른 색 지정
['r','orange','y','g','b','navy','violet']
plt.bar(df1['요일'],df1['매출액'], width=0.4, color=['r','orange','y','g','b','navy','violet'])
#### 막대 테두리
edgecolor = 테두리 색상
linewidth = 테두리 두께
plt.bar(df1['요일'],df1['매출액'], width=0.4, color=['r','orange','y','g','b','navy','violet']
       ,edgecolor='gray',linewidth=2)
##### 막대에 패턴 지정
hatch 파라미터에 기호 전달 : '/', '\', '|', '-', '+', 'x', 'o', 'O', '.', '*'
plt.bar(df1['요일'],df1['매출액'], width=0.4, color=['r','orange','y','g','b','navy','violet']
       ,edgecolor='gray',linewidth=2,hatch='x')
##### 패턴의 밀도 지정
패턴기호의 개수로 밀도를 조정한다.
plt.bar(df1['요일'],df1['매출액'], width=0.4, color=['r','orange','y','g','b','navy','violet']
       ,edgecolor='gray',linewidth=2,hatch='xx')
##### 막대마다 다른 패턴 지정
막대그래프를 객체로 받는다.
막대마다 다른 패턴을 지정한다.
set_hatch(기호)
#### 막대 위치 지정
<b>`align = center/edge`</b>
디폴트: center
edge로 지정하면 막대의 왼쪽 끝과 틱을 맞춘다.
막대의 오른쪽 끝과 틱을 맞추려면 width를 음수로 지정한다.
plt.bar(df1['요일'],df1['매출액'], width=0.4, align='edge')
##### 두 개의 막대그래프 비교하기
plt.bar(df1['요일'],df1['매출액'], width=-0.4, align='edge')
plt.barh(df1['요일'],df1['매출액'], height=-0.4, align='edge')

### 04-2. 데이터의 관계를 표현하는 산점도
#### 스캐터플롯
점의 크기, 색깔로 정보를 표현할 수 있다. (버블차트)
크기는 s, 색깔은 c로 지정한다.
##### 기본
plt.scatter(x,y)
plt.plot(x,y,'o')
##### 점의 크기
<b>`s=크기공통지정`</b>
<b>`s=크기목록`</b>
plt.scatter()의 파라미터 s로 점 크기를 지정한다.
점 크기는 공통된 크기로 지정할 수도 있고, 점마다 다른 크기로 지정할 수도 있다.
plt.scatter(x,y,s=[100,200,50,80,30])
##### 점의 색상
<b>`c=색상공통지정`</b>
<b>`c=색상목록`</b>
plt.scatter()의 파라미터 c로 점 색상을 지정한다.
점 색상은 공통된 색상으로 지정할 수도 있고, 점마다 다른 색상으로 지정할 수도 있다.
plt.scatter(x,y,s=[100,200,50,80,30], c='r')
['r','b','g','k','y']
컬러맵 지정 : cmap=컬러맵
컬러바 표시 : plt.colorbar()
컬러맵 : https://matplotlib.org/3.3.1/tutorials/colors/colormaps.html
##### 데이터 준비
어느 레스토랑의 팁 데이터
지불금액, 팁, 성별, 흡연여부, 요일, 시간대, 테이블인원
##### 지불금액과 팁의 관계
지불금액이 클수록 팁도 많이 줄까?
##### 점의 크기로 테이블 인원 표시
plt.scatter(tips['total_bill'], tips['tip'], s=tips['size']*50, alpha=0.5)
##### 점의 색으로 성별 표시
plt.scatter(tips['total_bill'], tips['tip'], s=tips['size']*50, alpha=0.5, c=tips['color'])

### 04-3. 색으로 값의 크기를  표현하는 히트맵
#### 히트맵
plt.pcolor(2차원데이터)
컬러맵의 종류
plt.pcolor(df, cmap='Blues')
#### 히트맵 예제
타이나틱호의 연령대_객실등급별 승선자수
plt.pcolor(titanic_pivot)
plt.colorbar()
plt.xticks(np.arange(0.5,len(titanic_pivot.columns),1), labels=titanic_pivot.columns)
plt.yticks(np.arange(0.5,len(titanic_pivot.index),1), labels=titanic_pivot.index)
heatmap(data=2차원데이터)
cmap=컬러맵 : 컬러맵 지정
annot=True : 수치 표시
fmt='d' : 정수로 표시
sns.heatmap(titanic_pivot, cmap='Blues', annot=True, fmt='d')

---

## Chapter 5. 분포 그래프

### 05-1. 데이터의 도수분포를 표현하는 히스토그램
#### 히스토그램
자료의 도수분포를 나타내는 그래프
수치를 나타내는 자료를 일정 구간(계급)으로 나누어 각 구간별 값의 개수(도수)를 나타낸다.
x축은 계급(값의 구간), y축은 도수(구간별 값의 개수)를 나타냄
<b>`plt.hist(data)`</b>
default : 10개의 구간으로 나누어 도수분포를 보여준다.
plt.hist(scores)
<b>` bins=구간의 개수 `</b>
plt.hist(scores, bins=20)
<b>`cumulative=True`</b>
plt.hist(scores, bins=20, cumulative=True)
<b>`range=(min,max)`</b>
<b>`density=True`</b>
도수를 총 개수로 나눈 수치를 y축에 표시
plt.hist(scores, density=True, cumulative=True)
<b>`orientation='horizontal'`</b>
plt.hist(scores,orientation='horizontal')
선만 표시 <b>`histtype='step'`</b>
`rwidth=막대폭(0~1)` `color=막대색` `alpha=투명도`
`edgecolor(ec)=선색` `linewidth(lw)=선두께` `linestyle(ls)=선스타일`
`hatch=패턴`

### 05-2. 데이터의 통계값을 표현하는 박스플롯
#### 박스플롯
데이터로부터 얻어진 아래의 다섯 가지 요약 수치를 사용해서 그려진다.
최소값
제 1사분위 수 (Q1) : 전체 데이터 중 하위 25%에 해당하는 값
제 2사분위 수 또는 중위수 (Q2)
제 3사분위 수 (Q3) : 전체 데이터 중 상위 25%에 해당하는 값
최대값
다른 값들과 동떨어진 값을 이상치로 표현한다.
어떤 값이 (1/4 지점의 값 - 1.5 * 사분위수 범위) 보다 작거나,
어떤 값이 (3/4 지점의 값 + 1.5 * 사분위수 범위) 보다 크면 그 값을 이상치로 정한다.
사분위수 범위 = 3/4 지점의 값 - 1/4 지점의 값
시리즈.describe()
1/4 지점의 값 : 시리즈.quantile(.25)
3/4 지점의 값 : 시리즈.quantile(.75)
이상치
1/4 지점의 값 - 1.5 * 사분위수 범위
3/4 지점의 값 + 1.5 * 사분위수 범위
##### 박스플롯
<b>`* plt.boxplot(data)`</b>
plt.boxplot(scores)
##### 평균 표시하기
showmeans=True
meanline=True
plt.boxplot(scores,showmeans=True, meanline=True)
##### 수평 박스플롯
vert=False
plt.boxplot(scores,showmeans=True, meanline=True, vert=False)
##### 여러 개의 데이터 비교하기
plt.boxplot(데이터리스트, labels=레이블리스트)
plt.boxplot([ iris['sepal_length'], iris['sepal_width'], iris['petal_length'], iris['petal_width']    ]
           , labels=['sepal_length', 'sepal_width','petal_length','petal_width']
           , showmeans=True)
plt.grid(axis='y')

### 05-3. 데이터의 범위와 분포를 표현하는 바이올린플롯
##### 바이올린플롯
plt.violinplot(data)
plt.violinplot(scores)
##### 최대값, 최소값, 평균값, 중간값 표시
showextrema=True/False : 최대값,최소값에 직선 표시(default:True)
showmeans=True/False : 평균값에 직선 표시(default:False)
showmedians=True/False : 중간값에 직선 표시(default:False)
plt.violinplot(scores, showextrema=True, showmeans=True, showmedians=True)
##### 분위수 지정하기
quantiles=0~1사이의 실수리스트
plt.violinplot(scores, showextrema=True, showmeans=True, showmedians=True
              ,quantiles=[0.25, 0.75])
##### 스타일 지정하기
바이올린플롯 객체를 받아서 스타일을 지정한다.
플롯['bodies'][인덱스].set_facecolor(컬러)
플롯['cmins'].set_edgecolor(컬러)
플롯['cmaxes'].set_edgecolor(컬러)
플롯['cbars'].set_edgecolor(컬러)
플롯['cmedians'].set_edgecolor(컬러)
플롯['cquantiles'].set_edgecolor(컬러)
플롯['cmeans'].set_edgecolor(컬러)
plt.violinplot(데이터리스트)
plt.violinplot([iris['sepal_length'], iris['sepal_width'], iris['petal_length'], iris['petal_width']])
plt.violinplot([iris['sepal_length'], iris['sepal_width'], iris['petal_length'], iris['petal_width']])
plt.xticks(range(1,5,1), labels=['sepal_length','sepal_width','petal_length','petal_width'])
plt.violinplot([iris['sepal_length'], iris['sepal_width'], iris['petal_length'], iris['petal_width']]
              , showmeans=True, showmedians=True)
plt.xticks(range(1,5,1), labels=['sepal_length','sepal_width','petal_length','petal_width'])
quantiles=분위수리스트
데이터별로 각각 지정한다.
plt.violinplot([iris['sepal_length'], iris['sepal_width'], iris['petal_length'], iris['petal_width']]
              , showmeans=True, showmedians=True
              , quantiles=[[0.25,0.75],[0.25,0.75],[0.25,0.75],[0.25,0.75]])
plt.xticks(range(1,5,1), labels=['sepal_length','sepal_width','petal_length','petal_width'])
바이올린플롯 객체를 받아서 스타일을 지정한다.
플롯['bodies'][인덱스].set_facecolor(컬러)
플롯['cmins'].set_edgecolor(컬러)
플롯['cmaxes'].set_edgecolor(컬러)
플롯['cbars'].set_edgecolor(컬러)
플롯['cmedians'].set_edgecolor(컬러)
플롯['cquantiles'].set_edgecolor(컬러)
플롯['cmeans'].set_edgecolor(컬러)

### 05-4. 데이터의 비율을 표현하는 파이차트
#### 파이차트
전체에 대한 각 부분의 비율을 부채꼴 모양으로 나타낸 그래프이다.
각 부채꼴의 중심각이 전체에서 해당 데이터가 차지하는 비율을 나타낸다.
1차원 리스트/배열/시리즈를 이용하여 그린다.
##### 기본 파이그래프 그리기
plt.pie(data)
plt.pie(Personnel)
##### 레이블 달기
labels=label목록
labeldistance = 그래프로부터 레이블을 얼만큼 떨어뜨려서 표시할것인가 (default:1.1)
##### 비율 표시하기
autopct = '%소수점자리수%%'
pctdistance = 중심에서의 거리(반지름을 1이라고 했을 때 반지름으로부터 얼만큼 떨어져서 비율을 표시할 것인지.., default:0.6)
plt.pie(Personnel, labels=blood_type, labeldistance = 1.2, autopct ='%.1f%%', pctdistance=0.6)
##### 돌출효과
explode=돌출정도리스트
반지름의 길이를 1이라고 했을 때를 기준으로 하여 돌출 정도를 지정
plt.pie(Personnel, labels=blood_type, labeldistance = 1.2, autopct ='%.1f%%', pctdistance=0.6
       , explode=[0.1,0,0,0])
##### 색상 바꾸기
colors = 색상리스트
['lightcoral', 'gold', 'greenyellow', 'skyblue']
##### 시작각도
startangle = 시작각도
기본시작각도는 3시방향
시작각도를 지정하면 3시방향으로부터 반 시계방향으로 각도만큼 이동하여 시작
plt.pie(Personnel, labels=blood_type, labeldistance = 1.2, autopct ='%.1f%%', pctdistance=0.6
       , explode=[0.1,0,0,0]
       , colors =['lightcoral', 'gold', 'greenyellow', 'skyblue']
       , startangle=90)
##### 회전방향
counterclock=True/False (반시계/시계)
plt.pie(Personnel, labels=blood_type, labeldistance = 1.2, autopct ='%.1f%%', pctdistance=0.6
       , explode=[0.1,0,0,0]
       , colors =['lightcoral', 'gold', 'greenyellow', 'skyblue']
       , startangle=90
       , counterclock = False)
##### 범례
legend(레이블리스트)
plt.legend(loc=(1,0.5))
plt.show()
##### 반지름
radius=반지름(Default:1)
plt.pie(Personnel, labels=blood_type, labeldistance = 1.2, autopct ='%.1f%%', pctdistance=0.6
       , explode=[0.1,0,0,0]
       , colors =['lightcoral', 'gold', 'greenyellow', 'skyblue']
       , startangle=90
       , counterclock = False
       , radius=1)
##### 부채꼴 스타일
wedgeprops = {'ec':테두리컬러, 'lw':선두께, 'ls':선스타일, 'width':반지름에대한비율}
##### 폰트
textprops = {'fontsize':폰트사이즈, 'color':폰트컬러, 'rotation':폰트회전각도}
plt.pie(Personnel, labels=blood_type, labeldistance = 1.2, autopct ='%.1f%%', pctdistance=0.6
       , explode=[0.1,0,0,0]
       , colors =['lightcoral', 'gold', 'greenyellow', 'skyblue']
       , startangle=90
       , counterclock = False
       , radius=1
       , wedgeprops = {'ec':'k', 'lw':1,'ls':':' ,'width':0.7}
       , textprops = {'fontsize':12, 'color':'b', 'rotation':0})
##### 그래프 완성
plt.figure(figsize=(5,5), facecolor='ivory', edgecolor='gray', linewidth=2)
plt.pie(Personnel, labels=blood_type, labeldistance = 1.2, autopct ='%.1f%%', pctdistance=0.6
       , explode=[0.1,0,0,0]
       , colors =['lightcoral', 'gold', 'greenyellow', 'skyblue']
       , startangle=90
       , counterclock = False
       , radius=1
       , wedgeprops = {'ec':'k', 'lw':1,'ls':':' ,'width':0.7}
       , textprops = {'fontsize':12, 'color':'b', 'rotation':0})
plt.title('2019년 병역판정검사 - 혈액형 분포', size=15)

---

## Chapter 6. 그래프 꾸미기

### 06-1. 공통 스타일 지정하기
#### rcParams
rcParams : Runtime Configuration Parameters
그래프를 구성하는 공통 속성을 지정한다.
plt.rcParams['font.family']='Malgun Gothic'
plt.rcParams['figure.figsize']=(9,4)
plt.rcParams['axes.linewidth'] = 2
plt.rcParams['grid.alpha'] = 0.3
plt.rcParams['font.size']=12
plt.rcParams['xtick.top'] = True
plt.rcParams['lines.linewidth']=3
plt.rcParams['hatch.linewidth']=3
plt.rcParams['boxplot.boxprops.color'] = 'b'
plt.plot(df1['요일'],df1['매출액'])
plt.show()
plt.bar(df1['요일'],df1['매출액'], hatch='/')
plt.show()
plt.boxplot(scores)
plt.show()

### 06-2. 그래프 강조하기-영역채우기
##### 가로방향으로 채우기
`plt.fill_between(x슬라이싱, y슬라이싱)`
슬라이싱 범위가 같아야 한다.
plt.plot(x,y)
plt.fill_between(x[1:3], y[1:3], color='skyblue', alpha=0.5, hatch='/')
##### 세로방향으로 채우기
`plt.fill_betweenx(y슬라이싱, x슬라이싱)`
슬라이싱 범위가 같아야 한다.
plt.plot(x,y)
plt.fill_betweenx(y[:2], x[:2], alpha=0.3)
##### 두 그래프 사이의 영역 채우기
`plt.fill_between(x슬라이싱, y1슬라이싱, y2슬라이싱)`
plt.plot(x,y1)
plt.fill_between(x[1:3], y1[1:3], y2[1:3], color='darkorange')
##### 다각형 채우기
`plt.fill([x축의 좌표들],[y축의 좌표들])`
plt.plot(x,y)
plt.grid()
plt.fill([1.75, 2.25, 2.25, 1.75],[3.5, 3.5, 4.5, 4.5], alpha=0.1)

### 06-3. 그래프 강조하기-수직선과수평선
##### 수평선 그리기
`plt.axhline(y좌표, x축시작위치, x축끝위치)`
수평선의 길이가 1이라고 했을 때 x축시작위치, x축끝위치를 지정한다.
따로 지정하지 않으면 x축 전범위에 걸쳐 그려진디ㅏ.
`plt.hlines(y, x축시작좌표, x축끝좌표)`
plt.plot([1,2,3,4], 'ko')
plt.show()
##### 수직선 그리기
`axvline(x좌표, y축시작위치, y축끝위치)`
수직선의 길이가 1이라고 했을 때 y축시작위치, y축끝위치를 지정한다.
따로 지정하지 않으면 y축 전범위에 걸쳐 그려진디ㅏ.
`vlines(x, y축시작좌표, y축끝좌표)`
##### 요일 별 테이블 수
요일별 데이터 수
plt.figure(figsize=(15,3))
plt.barh(s.index, s.values)
plt.xticks(range(0,91,1), rotation=90)
plt.grid(axis='x')
plt.axvline(s['Fri'], color='k')

### 06-4. 그래프에 설명적기-text, annotation
#### 텍스트 추가하기
plt.text(x좌표, y좌표, 텍스트)
rotation=회전각도
ha : horizontal alignment
va : vertical alignment
텍스트 상자
`bbox = {'boxstyle':상자스타일, 'fc':facecolor,'ec':edgecolor,...}`
boxstyle : 'round'/'square'
plt.text(2.1, 3, '(x:2, y:3)', ha='left', va='bottom', fontsize=12, rotation=45
        , bbox={'boxstyle':'round', 'fc':'skyblue', 'ec':'b', 'alpha':0.3})
plt.show()
#### 화살표와 텍스트 추가하기
`plt.annotate('텍스트',xy=(화살표x,화살표y), xytext=(텍스트x,텍스트y), arrowprops=화살표속성(딕셔너리))`
화살표 속성
`width`        The width of the arrow in points
`headwidth`    The width of the base of the arrow head in points
`headlength`   The length of the arrow head in points
`shrink`       Fraction of total length to shrink from both ends

### 06-5. 2중 y축 표시하기
#### 두가지 정보를 하나의 그래프에 그리기
축을 분리하기 위해 객체지향으로 그린다.
fig, ax = plt.subplots()
ax.bar(age, height, color='skyblue', width=0.5, ec='lightgray', label='height')
ax.plot(age, weight, color='darkred', marker='o', ls='-.', label='weight')
plt.legend()
##### 2중 y축 만들기
x축을 공유하는 새로운 axes객체를 만든다.
`axes객체.twinx()`
##### 축 레이블 표시하기
`axes객체.set_xlabel(x레이블)`
`axes객체.set_ylabel(y레이블)`
##### y축 범위 지정
axes객체.set_ylim(y축눈금범위)
##### y축 눈금
axes객체.set_yticks(y축눈금)
axes객체.tick_params(...)
##### 범례 표시
axes객체별로 legend메소드 호출
##### 그리드 표시
axes객체.grid()

---

## Chapter 7. Seaborn

### 07-1. Seaborn - 막대그래프(barplot)
요일별 팁 평균 계산
그룹핑 : 데이터프레임.groupby(그룹기준컬럼)[통계적용컬럼].통계함수
plt.bar(x,y)
plt.bar(day_tip_mean.index, day_tip_mean)
plt.xlabel('day')
plt.ylabel('tip')
plt.title('요일별 팁 평균', size=15)
##### seaborn으로 그리기
<b>`sns.barplot(data=데이터프레임명, x=x축컬럼, y=y축컬럼)`</b>
x축데이터로 그룹핑한 y축데이터의 평균값을 계산하여 그래프를 그려준다.
신뢰구간(CI:Confidence Interval)을 함께 표시
sns.barplot(data=tips, x='day', y='tip', ci=None)
plt.title('요일별 팁 평균', size=15)
##### matplotlib으로 그리기
plt.bar(day_tip_sum.index, day_tip_sum)
plt.xlabel('day')
plt.ylabel('tip')
plt.title('요일별 팁 합계', size=15)
##### seaborn으로 그리기
estimator = 통계함수
sns.barplot(data=tips, x='day', y='tip', ci=None, estimator=sum)
plt.title('요일별 팁 합계', size=15)
#### 요일별 팁 합계를 흡연여부로 비교
hue : y를 그룹핑할 컬럼
hue 색상 변경 : palette = 구분:색상 딕셔너리
pyplot의 메소드로 그리드 추가
sns.barplot(data=tips, x='day', y='tip', ci=None, estimator=sum, hue='smoker'
           , palette ={'Yes':'gray', 'No':'skyblue'})
plt.title('요일별 팁 합계', size=15)
plt.grid(axis='y', ls=':')

### 07-2. Seaborn - scatterplot
##### 멧플롯립으로 그리기
plt.scatter(x,y)
plt.scatter(tips['total_bill'],tips['tip'])
##### 요일 구분
total_bill에 따른 tip의 분포 - 색상으로 요일 표시
'Sun':'red'
'Sat':'blue'
'Thur':'green'
'Fri':'yello'
plt.scatter(tips_Sun['total_bill'], tips_Sun['tip'], label='Sun', s=tips_Sun['size']*30, alpha=0.5)
plt.legend()
plt.xlabel('totla_bill')
plt.ylabel('tip')
##### seaborn으로 그리기
<b>`sns.scatterplot(data=데이터프레임, x=x축컬럼, y=y축컬럼)`</b>
sns.scatterplot(data=tips, x='total_bill', y='tip', hue='day', size='size', alpha=0.5)

### 07-3. Seaborn-lineplot
##### matplotlib으로 시각화
plt.plot(x,y)
plt.plot(flights_year, 'ro--')
plt.xlabel('yeat')
plt.ylabel('passengers')
##### seaborn
`sns.lineplot(data=데이터프레임, x=x축컬럼, y=y축컬럼, estimator=통계함수)`
estimator를 생략하면 평균으로 통계를 적용함
전체 데이터로 차트를 그리면 신뢰구간 표시
sns.lineplot(data=flights, x='year', y='passengers', ci=None, estimator=sum, color='r', marker='o', ls=':')
    plt.plot(flights_pivot.iloc[i], label=flights_pivot.index[i])
plt.legend()
##### seaborn으로 시각화
sns.lineplot(data=flights, x='month', y='passengers', ci=None, hue='year')

### 07-4. Seaborn - 데이터의 분포를 나타내는 여러가지 그래프
#### 카운트플롯
데이터의 갯수를 카운트하여 시각화
`sns.countplot(data=데이터프레임, x=컬럼)`
plt.figure(figsize=(15,4))
sns.countplot(data=titanic, x='who', hue='alive')
plt.xticks(rotation=90)
plt.grid(axis='y')
#### 러그플롯
`sns.rugplot(data=데이터프레임, x=컬럼)`
sns.rugplot(data=titanic,x='age', hue='alive')
#### 히스토그램
`sns.displot(data=데이터프레임, x=컬럼)`
sns.displot(data=iris, x='petal_length', bins=20, rug=True, hue='species', kde=True)
#### 상자수염그래프, 바이올린플롯, 스트립플롯, 스웜플롯
sns.boxplot(data=데이터프레임)
sns.violinplot(data=데이터프레임)
sns.stripplot(data=데이터프레임)
sns.swarmplot(data=데이터프레임)
sns.boxplot(data=iris, x='species', y='petal_length')
plt.show()

---

## Chapter 11. 실전 프로젝트

### 11-0. 지역별 인구구조 시각화
#### 데이터 수집 및 전처리
행정안전부
정책자료 > 주민등록인구통계
전체읍면동 현황
바로가기
##### 시도별 서브셋 생성
`컬럼.str.contains(문자열)` : 문자열이 포함된 데이터 추출
시도명 컬럼 추가
#### 시도별 인구수 시각화
인구 수가 가장 많은 지역은 어디일까?
인구 수가 가장 적은 지역은 어디일까?
plt.rcParams['figure.figsize']=(15,5)
plt.bar(df_sido['시도명'], df_sido['총인구수'])
plt.xticks(rotation=90)
plt.title('2021년 10월 시도별 총 인구수', size=20)
plt.xlabel('시도명')
plt.ylabel('총인구수')
plt.grid(axis='y', ls=':')
sns.barplot(data=df_sido, x='시도명', y='총인구수')
plt.title('2021년 10월 시도별 총 인구수', size=20)
plt.grid(axis='y', ls=':')
plt.xticks(rotation=90)
##### 파이그래프로 시각화하기
plt.figure(facecolor='snow')
plt.pie(df_sido['총인구수'], labels=df_sido['시도명']
       ,autopct='%.1f%%', pctdistance=0.8, rotatelabels=True)
plt.title('2021년 10월 시도별 총 인구수', size=20)
#### 시도별 세대당 인구수 시각화
2중 y축 표시하기
`fig, ax1 = plt.subplots()`
`ax2 = ax1.twinx()`
plt.xticks(rotation=45)
#### 시도별 성별 인구수 시각화
plt.xticks(rotation=90)
내림차순으로 정렬
sns.barplot(data=df_sido, x='시도명', y='남여인구수차이')
plt.xticks(rotation=45)
plt.axhline(0, color='gray')
plt.title('2021년 10월 시도별 남여 인구수 차이', size=20)
plt.ylabel('남자인구수-여자인구수')
sns.barplot(data=df_seoul, x='구', y='총인구수')
plt.title('2021년 10월 서울시 구별 총 인구수', size=20)
plt.xticks(rotation=45)
##### 동별 인구수 시각화
송파구 동별 인구수 시각화
sns.barplot(data=df_song, x='동', y='총인구수')
plt.title('2021년 10월 송파구 동별 총 인구수', size=20)
plt.xticks(rotation=45)