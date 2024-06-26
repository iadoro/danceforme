// ----------------------------------- WEBCAM PROCESSING -----------------------------------------

import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils,
} from "https://cdn.skypack.dev/@mediapipe/tasks-vision@0.10.0";

let poseLandmarker = undefined;
let runningMode = "IMAGE";
let enableWebcamButton;
let webcamRunning = false;
const videoHeight = "95%";
const videoWidth = "100%";

// Before we can use PoseLandmarker class we must wait for it to finish
// loading. Machine Learning models can be large and take a moment to
// get everything needed to run.
const createPoseLandmarker = async (numPeople) => {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
  );
  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
      delegate: "GPU",
    },
    runningMode: runningMode,
    numPoses: numPeople,
  });
};
const numPeople = document.getElementById("numPeople");
numPeople.addEventListener("change", function () {
  createPoseLandmarker(this.value);
  lastLandmarks = null;
});
createPoseLandmarker(numPeople.value);

const video = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");
const drawingUtils = new DrawingUtils(canvasCtx);

// Check if webcam access is supported.
const hasGetUserMedia = () => !!navigator.mediaDevices?.getUserMedia;

// If webcam supported, add event listener to button for when user
// wants to activate it.
if (hasGetUserMedia()) {
  enableWebcamButton = document.getElementById("webcamButton");
  enableWebcamButton.addEventListener("click", enableCam);
} else {
  console.warn("getUserMedia() is not supported by your browser");
}

// Enable the live webcam view and start detection.
function enableCam(event) {
  if (!poseLandmarker) {
    console.log("Wait! poseLandmaker not loaded yet.");
    return;
  }

  if (webcamRunning === true) {
    webcamRunning = false;
    enableWebcamButton.innerText = "enable predictions";
  } else {
    webcamRunning = true;
    enableWebcamButton.innerText = "disable predictions";
  }

  // getUsermedia parameters.
  const constraints = {
    video: true,
  };
  console.debug("working!!!!");
  // Activate the webcam stream.
  navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
    video.srcObject = stream;
    video.addEventListener("loadeddata", predictWebcam);
  });
}

let lastLandmarks = null;
let count = 0;
let interval = 10;
let lastVideoTime = -1;
async function predictWebcam() {
  canvasElement.style.height = videoHeight;
  video.style.height = videoHeight;
  canvasElement.style.width = videoWidth;
  video.style.width = videoWidth;
  // Now let's start detecting the stream.
  if (runningMode === "IMAGE") {
    runningMode = "VIDEO";
    await poseLandmarker.setOptions({ runningMode: "VIDEO", num_poses: 2 });
  }
  let startTimeMs = performance.now();
  if (lastVideoTime !== video.currentTime) {
    count += 1;
    lastVideoTime = video.currentTime;
    poseLandmarker.detectForVideo(video, startTimeMs, (result) => {
      canvasCtx.save();
      canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

      let rightArmAngle = -1;
      let leftArmAngle = -1;
      for (const landmark of result.landmarks) {
        drawingUtils.drawConnectors(landmark, PoseLandmarker.POSE_CONNECTIONS);
        rightArmAngle += calcRightArmAngle(landmark) / result.landmarks.length;
        leftArmAngle += calcLeftArmAngle(landmark) / result.landmarks.length;
      }

      let rightFootDiff = -1;
      let leftFootDiff = -1;
      let headDiff = -1;

      if (count % interval == 0) {
        if (result.landmarks.length == numPeople.value) {
          rightFootDiff = calcLandmarkDiff(result.landmarks, lastLandmarks, 28);
          leftFootDiff = calcLandmarkDiff(result.landmarks, lastLandmarks, 27);
          headDiff = calcLandmarkDiff(result.landmarks, lastLandmarks, 0);
          lastLandmarks = result.landmarks;
          count = 0;
          // console.log("Feet difference: " + rightFootDiff);
          // console.log("Head Difference: " + headDiff);
        } else {
          count--;
        }
      }

      console.debug("Right arm angle: " + rightArmAngle);
      console.debug("Left arm angle: " + leftArmAngle);
      if (count % interval == 0) {
        adjustPlayerEffects(
          rightArmAngle,
          leftArmAngle,
          rightFootDiff,
          leftFootDiff,
          headDiff
        );
      }

      canvasCtx.restore();
    });
  }

  // Call this function again to keep predicting when the browser is ready.
  if (webcamRunning === true) {
    window.requestAnimationFrame(predictWebcam);
  }
}

function calcRightArmAngle(landmark) {
  //Returns angle between -90 and 90
  let rightShoulder = landmark[12];
  let rightElbow = landmark[14];

  let angle = angleWithXAxis(
    rightElbow.x - rightShoulder.x,
    rightElbow.y - rightShoulder.y
  );

  const positiveAngle = angle >= 0 ? angle : 360 + angle;

  return clamp(positiveAngle - 180, -90, 90);
}

function calcLeftArmAngle(landmark) {
  //Returns angle between -90 and 90
  let leftShoulder = landmark[11];
  let leftElbow = landmark[13];

  let angle = angleWithXAxis(
    leftElbow.x - leftShoulder.x,
    leftElbow.y - leftShoulder.y
  );

  return clamp(-1 * angle, -90, 90);
}

function calcLandmarkDiff(landmarks, pastLandmarks, landmarkNum) {
  //Returns x-difference of pose number
  if (pastLandmarks == null) {
    return 0;
  }
  let landmarkX = landmarks.map((landmark) => {
    return landmark[landmarkNum].x;
  });
  let pastLandmarkX = pastLandmarks.map((landmark) => {
    return landmark[landmarkNum].x;
  });
  landmarkX.sort();
  pastLandmarkX.sort();
  // console.debug(landmarkX);
  // console.debug(pastLandmarkX);
  let differences = 0;
  for (let i = 0; i < numPeople.value; i += 1) {
    differences += landmarkX[i] - pastLandmarkX[i];
  }
  // console.debug(differences);
  // console.debug(numPeople);
  return differences / numPeople.value;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function adjustPlayerEffects(
  rightArmAngle,
  leftArmAngle,
  rightFootDiff,
  leftFootDiff,
  headDiff
) {
  if (distortion.flag && leftArmAngle !== -1) {
    let distort = Math.abs(leftArmAngle) / 180;
    console.log("Distortion: " + distort);
    distortion.effect.distortion = clamp(distort, 0, 0.5);
  }

  if (feedbackDelay.flag && rightArmAngle !== -1) {
    let feedback = Math.abs(rightArmAngle) / 180;
    let delay = Math.abs(rightArmAngle) / 90;
    console.log("Feedback: " + feedback);
    console.log("Delay: " + delay);
    feedbackDelay.effect.delayTime.value = parseFloat(clamp(delay, 0, 1)); //seconds, any value
    feedbackDelay.effect.feedback.value = parseFloat(clamp(feedback, 0, 0.5)); //between [0,1]
  }

  if (pitchShift.flag && leftFootDiff !== -1) {
    let pitch = Math.abs(leftFootDiff * 60);
    console.log("Pitch: " + pitch);
    pitchShift.effect.pitch = parseFloat(clamp(pitch, 0, 12)); //half step increments, [0,12]
  }

  if (playbackRate.flag && headDiff !== -1) {
    let playbackRate = Math.abs(headDiff * 10) + 0.3;
    console.log("PlaybackRate: " + playbackRate);
    audioElement.playbackRate = parseFloat(clamp(playbackRate, 0.75, 1.25)); // [.2, 1.8]
  }

  if (phaser.flag && rightFootDiff !== -1) {
    //TODOL add phaser formula
    let octaves = Math.abs(rightFootDiff) * 100;
    console.log("Octaves: " + octaves);
    phaser.effect.octaves = parseFloat(clamp(octaves, 0, 8));
  }

  console.log("------------------");
}
function angleWithXAxis(x, y) {
  // Calculate the angle in radians using Math.atan2
  const angleRadians = Math.atan2(y, x);

  // Convert radians to degrees
  const angleDegrees = angleRadians * (180 / Math.PI);

  return angleDegrees;
}

// // ----------------------------------- AUDIO PLAYER -----------------------------------------
const audioElement = document.getElementById("audioElement");
let player = Tone.getContext().createMediaElementSource(audioElement);
// audioElement.autoplay = true;
// audioElement.src = "song-files/Sean Paul, J Balvin - Contra La Pared.wav";
let pitchShift = {
  name: "pitch shift",
  effect: new Tone.PitchShift(),
  flag: false,
};
let phaser = {
  name: "phaser",
  effect: new Tone.Phaser({
    frequency: 10,
    baseFrequency: 100,
  }),
  flag: false,
};
let feedbackDelay = {
  name: "feedback delay",
  effect: new Tone.FeedbackDelay(),
  flag: false,
};
let distortion = {
  name: "distortion",
  effect: new Tone.Distortion(),
  flag: false,
};

let playbackRate = { name: "playback rate", effect: null, flag: false };
let effectMap = [pitchShift, phaser, feedbackDelay, distortion, playbackRate];

function addCheckboxes(effectMap) {
  const container = document.getElementById("checkboxes");
  effectMap.forEach((effect) => {
    let str = effect.name;
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = str;
    checkbox.name = str.replace(/\s+/g, "-").toLowerCase(); // Convert spaces to hyphens and make lowercase for name attribute
    checkbox.id = str.replace(/\s+/g, "-").toLowerCase() + "-checkbox"; // Unique ID for the checkbox
    checkbox.checked = false; //true; // Initially unchecked
    effect.id = checkbox.id;

    const label = document.createElement("label");
    label.htmlFor = checkbox.id;
    label.textContent = str;

    const lineBreak = document.createElement("br");

    container.appendChild(checkbox);
    container.appendChild(label);
    container.appendChild(lineBreak);
  });
}
addCheckboxes(effectMap);

function handleFileUpload(event) {
  const file = event.target.files[0];
  //const fileUrl = 'Sean Paul, J Balvin - Contra La Pared.wav'
  const fileUrl = URL.createObjectURL(file);
  Tone.start();

  audioElement.src = fileUrl;
  setUpEffects(player);
}

function setUpEffects(tonePlayer) {
  let lastEffect = tonePlayer;
  effectMap.forEach(function (effect) {
    effect.flag = false;
    let checkbox = document.getElementById(effect.id);
    if (checkbox.checked) {
      console.info(checkbox.value + " is checked.");
      if (effect.name !== "playback rate") {
        Tone.connect(lastEffect, effect.effect);
        lastEffect = effect.effect;
      }
      effect.flag = true;
      console.info(effectMap);
    }
  });
  Tone.connect(lastEffect, Tone.getDestination());
}
// setUpEffects(player);

function changeEffects() {
  Tone.disconnect(player);
  effectMap.forEach(function (effect) {
    if (effect.name !== "playback rate") Tone.disconnect(effect.effect);
  });

  setUpEffects(player);
  audioElement.playbackRate = 1;
}

document.getElementById("openSettings").addEventListener("click", function () {
  settingsPopup.classList.add("show");
});
document.getElementById("closeSettings").addEventListener("click", function () {
  settingsPopup.classList.remove("show");
  changeEffects();
});
window.addEventListener("click", function (event) {
  if (event.target == settingsPopup) {
    settingsPopup.classList.remove("show");
    changeEffects();
  }
});

// Get references to UI elements
const audioFileInput = document.getElementById("audioFileInput");
audioFileInput.addEventListener("change", handleFileUpload);
