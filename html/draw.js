///<reference path="./types.d.ts"/>

google.charts.load('current', { 'packages': ['corechart'] });

/**
 * @typedef {{
 *    toHeight:number
 *    duration:number
 *    index:number
 *    t:number
 *    preCt:number
 * }} SElement
 */

function getBaseLog(base, y) {
  return Math.log(y) / Math.log(base);
}

function match(cur, threshhold) {
  const extremeDiff = Math.abs(cur - threshhold)
  return extremeDiff < 0.1 * threshhold
}

function percentile(array, n) {
  const sorted = array.sort((a, b) => a - b);
  const index = (n / 100) * (sorted.length - 1);
  const floor = Math.floor(index);
  const ceil = Math.ceil(index);
  if(floor === ceil) {
    return sorted[floor];
  }
  return (sorted[floor] * (ceil - index)) + (sorted[ceil] * (index - floor));
}


google.charts.setOnLoadCallback(() => {
  const chart = new google.visualization.LineChart(document.getElementById("graph"));
  const chartCt = new google.visualization.ColumnChart(document.getElementById("ctgraph"));
  /**
   * @type {{code?:string,baud?:number}}
   */
  let result = {}
  const host = "http://192.168.178.40"
  document.querySelector("#replay").addEventListener("click", async () => {
    if(!result.code || !result.baud) {
      return
    }
    const resp = await fetch(host + "/custom", {
      method: "POST",
      body: JSON.stringify({
        "signal": result.code,
        "baud": Math.floor(result.baud)
      })
    })
  })
  document.querySelector("#parse").addEventListener("click", async () => {
    const resp = await fetch(host + "/read", {})
    const dataTxt = await resp.text();
    if(dataTxt.length == 0) {
      document.querySelector("#parse").textContent = "parse signal (no content) " + Date.now()
      return;
    }
    /**
     * @type {Array<SElement>}
     */
    const data = JSON.parse(dataTxt);

    if(data.length == 0) {
      document.querySelector("#parse").textContent = "parse signal (no data) " + Date.now()
      return;
    }
    if(data.length < 100) {
      document.querySelector("#parse").textContent = "parse signal (few data) " + Date.now()
      return;
    }
    try {
      /**
       * @type {Array<Array<string|number>>}
       */
      const ar = [["time", "high"]]
      /**
       * @type {Array<Array<string|number>>}
       */
      const arBar = [["time", "prevCt20"]]
      /**
       * @type {Array<Array<string|number>>}
       */
      const sigAr = [["time", "prevCt20"]]
      let t = 0;
      /**
       * @type { SElement}
       */
      let highCt;
      for(let i = 0; i < data.length; i++) {
        const el = data[i]
        el.index = i;
        if(el.duration < 10) {
          continue;
        }

        // if(t > 4000000 && t < 4300000) {
        ar.push([t + 1, 1 - el.toHeight]);
        ar.push([t + el.duration, 1 - el.toHeight]);
        //}
        el.t = t;
        let wellFormedCt = getAmountOfSimilarlyStruturedSignalsAroundIndex(data, el, i);
        el.preCt = wellFormedCt;
        if(!highCt || highCt.preCt < el.preCt) {
          highCt = el;
        }


        arBar.push([t + el.duration, el.preCt,]);

        t += el.duration
      }
      let signalList = getRelevantSignalElements(data, highCt);



      const occurances = []

      for(const el of signalList) {

        let ct = 0;
        let sum = 0
        for(let subel of signalList) {
          const diff = Math.abs(subel.duration - el.duration)
          if(diff < 0.1 * el.duration) {
            ct++;
            sum += subel.duration;
          }
        }
        const avg = sum / ct;
        occurances.push(avg)

        sigAr.push([el.t + 1, 1 - el.toHeight]);
        sigAr.push([el.t + el.duration, 1 - el.toHeight]);
      }

      const short = percentile(occurances, 25);
      const long = percentile(occurances, 75);
      const extrem = percentile(occurances, 99);

      /**
       * @type {Array<{start?:number,end?:number,value:string,count:number}>}
       */
      const signalCat = []
      let signalI = 0;


      const bitLength = []
      for(let i = 0; i < signalList.length; i++) {
        const current = signalList[i]
        if(match(current.duration, extrem)) {
          if(signalCat[signalI]) {
            signalCat[signalI].end = signalList[i - 1]?.t;
          }
          signalI++;
        }
        signalCat[signalI] ??= { value: "", count: 0 }

        if(current.toHeight == 0) {
          let next = signalList[i + 1]
          if(!next || (next.toHeight == 0)) {
            continue
          }

          if(!signalCat[signalI].value.length) {
            signalCat[signalI].start = current.t;
          }
          if(match(current.duration, short) || (match(next.duration, long) || match(next.duration, extrem))) {
            signalCat[signalI].value += "S"
            signalCat[signalI].count += 4;
            bitLength.push(current.duration)
            if(match(next.duration, long)) {

              bitLength.push(next.duration / 3)
            }
          } else if(match(current.duration, long) || (match(next.duration, short) || match(next.duration, extrem))) {

            bitLength.push(current.duration / 3)
            if(match(next.duration, short)) {
              bitLength.push(next.duration)
            }
            signalCat[signalI].value += "L"
            signalCat[signalI].count += 4;
          } else {
            signalCat[signalI].value += "X"
          }
        }
      }

      const lengthSorted = signalCat
        .map(el => el.value)
        .sort((el1, el2) => el2.length - el1.length);
      /**
       * @type {string}
       */
      const longest = lengthSorted[0]
      if(signalCat.filter(el => el.value == longest).length > 1) {
        document.querySelector("#txt").textContent = longest
        result.code = longest;
        console.log(longest)
      } else {

        let allSub = true;
        for(let i = 1; i < lengthSorted.length; i++) {
          const currentCheck = lengthSorted[i]
          if(!currentCheck?.length) {
            continue
          }
          const match = longest.match(new RegExp(currentCheck.replace(/X/g, ".")))
          if(!match) {
            allSub = false;
          }
        }
        if(allSub) {
          document.querySelector("#txt").textContent = longest
          result.code = longest;
          console.log(longest)
        } else {
          debugger;
        }
      }

      const sigLength = (signalCat[1].end - signalCat[1].start) / signalCat[1].count

      const baud = 1000000 / sigLength;
      result.baud = baud;
      document.querySelector("#txt").textContent += " baud: " + Math.floor(baud)


      const dataT = google.visualization.arrayToDataTable(ar);

      chart.draw(dataT, { chartArea: {}, width: 20000 });

      const dataBr = google.visualization.arrayToDataTable(arBar);

      chartCt.draw(dataBr, { chartArea: {}, width: 20000 });
      new google.visualization.LineChart(document.getElementById("signal"))
        .draw(google.visualization.arrayToDataTable(sigAr), { chartArea: {}, width: 20000 });
    } catch(e) {
      debugger;
    }
  })



});

/**
 * @param {number} i
 * @param {SElement} el
 * @param {Array<SElement>} data
 */
function getAmountOfSimilarlyStruturedSignalsAroundIndex(data, el, i) {
  let wellFormedCt = 0;

  let currentDuration = el.duration;
  let otherDuration = null;
  for(let j = i - 1; j > 0; j--) {
    const subEl = data[j];
    if(match(subEl.duration, currentDuration)) {
      wellFormedCt++;
    } else if(otherDuration == null) {
      otherDuration = subEl.duration;
    } else if(match(subEl.duration, otherDuration)) {
      wellFormedCt++;
    } else {
      break;
    }

  }
  let otherDurationInc = null;
  for(let j = i + 1; j < data.length; j++) {
    const subEl = data[j];
    if(match(subEl.duration, currentDuration)) {
      wellFormedCt++;
    } else if(otherDurationInc == null) {
      otherDurationInc = subEl.duration;
    } else if(match(subEl.duration, otherDurationInc)) {
      wellFormedCt++;
    } else {
      break;
    }

  }
  return wellFormedCt;
}
/**
 * 
 * @param {Array<SElement>} data 
 * @param {SElement} highCt 
 */
function getRelevantSignalElements(data, highCt) {
  let signalList = [];

  for(let i = highCt.index; i > 0; i--) {
    const current = data[i];

    if(current.duration > 15000) {
      break;
    }
    signalList.unshift(current);
  }
  for(let i = highCt.index + 1; i < data.length; i++) {
    const current = data[i];

    if(current.duration > 15000) {
      break;
    }
    signalList.push(current);
  }
  return signalList;
}

