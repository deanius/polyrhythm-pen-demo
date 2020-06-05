import React from "react";
import { createStore } from "redux";
import { connect } from "react-redux";
import { fromJS } from "immutable";
import { after } from "polyrhythm";

import ReactDOM from "react-dom";
const { concat } = Rx.Observable;

var Gadget = ({ device, light, coil }) => (
  <svg
    width="200"
    height="200"
    viewBox="0 0 120 120"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g>
      <rect
        title="heating coil"
        x="30"
        y="0"
        width="60"
        height="38"
        fill={coil ? "#f00000" : "#444444"}
      />
      <rect
        title="Coil indicating LED"
        x="30"
        y="40"
        width="60"
        height="138"
        fill={light ? "#0000bb" : "#000000"}
      />
      <rect
        title="Power button"
        x="30"
        y="180"
        width="60"
        height="70"
        fill={device ? "#dddddd" : "#444444"}
      />
      <text
        id="statusText"
        className={"" /* "blinking" */}
        x="47"
        y="105"
        fill={device ? "#444444" : "#dddddd"}
      >
        {device ? "ON" : "OFF"}
      </text>
    </g>
  </svg>
);

let initialState = {
  device: false,
  light: false,
  coil: false
};

let deviceReducer = (state, { type, payload }) => {
  // turn on
  if (type === "5_BUTTON_CLICK" && !state.get("device")) {
    return state.merge({
      device: true
    });
  }

  // turn off
  if (type === "5_BUTTON_CLICK" && state.get("device")) {
    return state.merge({
      device: false,
      light: false,
      coil: false
    });
  }

  // fire it up
  if (type === "BUTTON_DOWN" && state.get("device")) {
    return state.merge({
      light: true,
      coil: true
    });
  }

  // release button
  if (type === "BUTTON_UP" && state.get("device")) {
    return state.merge({
      light: false,
      coil: false
    });
  }

  return state;
};

let storeFactory = createStore;

if (window.__REDUX_DEVTOOLS_EXTENSION__) {
  storeFactory = window.__REDUX_DEVTOOLS_EXTENSION__()(createStore);
}

let store = storeFactory(deviceReducer, fromJS(initialState));
let ConnectedGadget = connect(s => s.toJS())(Gadget);

ReactDOM.render(
  <ConnectedGadget store={store} />,
  document.getElementById("gadget")
);

let events = concat(
  // turn on
  after(1000, () => "5_BUTTON_CLICK"),
  // cycle the light/coil
  after(1000, () => "BUTTON_DOWN"),
  after(1000, () => "BUTTON_UP"),
  after(1000, () => "5_BUTTON_CLICK"),
  after(100, () => "BUTTON_DOWN")
);

function runDemo() {
  events.subscribe(type => store.dispatch({ type }));
}
runDemo();

let deviceButton = document.getElementById("deviceButton");
let deviceButtonDown$;
let deviceButtonUp$;

if ("ontouchstart" in document.documentElement) {
  deviceButtonDown$ = Rx.Observable.fromEvent(document, "ontouchstart").map(
    e => ({ type: "BUTTON_DOWN" })
  );

  deviceButtonUp$ = Rx.Observable.fromEvent(document, "ontouchend").map(e => ({
    type: "BUTTON_UP"
  }));
} else {
  deviceButtonDown$ = Rx.Observable.fromEvent(deviceButton, "mousedown").map(
    e => ({ type: "BUTTON_DOWN" })
  );

  deviceButtonUp$ = Rx.Observable.fromEvent(deviceButton, "mouseup").map(e => ({
    type: "BUTTON_UP"
  }));
}

let buttonChanges$ = deviceButtonDown$.merge(deviceButtonUp$);

let quintClicks$ = deviceButtonDown$
  // ensure we have allowed the following up to occur
  .zip(deviceButtonUp$)
  // Pass a quint if tmax-tmin is within a threshold
  .timestamp()
  .bufferWithCount(5, 1)
  // pass if all are within a threshold
  .filter(fiveBlock => fiveBlock[4].timestamp - fiveBlock[0].timestamp < 1500)
  // and not significantly slower at the beginning or end
  .filter(fiveBlock => fiveBlock[2].timestamp - fiveBlock[0].timestamp < 750)
  .filter(fiveBlock => fiveBlock[4].timestamp - fiveBlock[2].timestamp < 750)
  // Quiesce: prevent 6-click from appearing as 2 quints
  // Differs from throttling in that an empty duration of recovery period is required
  .throttle(1500)
  .map(() => ({ type: "5_BUTTON_CLICK" }));

let logDiv = document.getElementById("action-log");

let symbol = a => {
  if (a.type === "BUTTON_DOWN") return "⬇︎";
  if (a.type === "BUTTON_UP") return "⬆︎";
  if (a.type === "5_BUTTON_CLICK") return "✬\n";
};

let logIt = a => {
  console.log(a.type);
  logDiv.textContent = logDiv.textContent + symbol(a);
  logDiv.scrollTop = logDiv.scrollHeight;
};

let makeBlink = () => {
  let el = document.getElementById("statusText");
  el.classList.remove("blinking");
  setTimeout(() => {
    el.classList.add("blinking");
  }, 0);
};

let allActions$ = buttonChanges$.merge(quintClicks$);

allActions$.subscribe(a => store.dispatch(a));

allActions$.filter(a => a.type == "5_BUTTON_CLICK").subscribe(makeBlink);

allActions$
  // schedules on a timeout so logging won't block dispatch
  .subscribeOn(Rx.Scheduler.async)
  .subscribe(logIt);
