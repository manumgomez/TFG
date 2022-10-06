/* jshint esversion: 9 */
/* global THREE, AFRAME */
let arrTile = [];
AFRAME.registerComponent("board", {
  schema: {
    chessBoardColumns: {
      type: "array",
      default: [1, 2, 3, 4, 5, 6, 7, 8]
    },
    chessBoardRows: { type: "array", default: [8, 7, 6, 5, 4, 3, 2, 1] }
  },
  init: function () {
    // start by removing all child nodes; seems that this is the fastest way
    while (this.el.lastChild) {
      this.el.removeChild(this.el.lastChild);
    }
    // add the tiles
    this._drawBoard();
    //this._createPieces();
    // initialize the CHESSBOARD object
    //CHESSBOARD.initChessBoard();
  },
  _drawBoard: function () {
    let self = this;
    self.data.chessBoardColumns.forEach(function (col, colIndex) {
      arrTile.push([]);
      self.data.chessBoardRows.forEach(function (row, rowIndex) {
        // color of the new tile is easily determined; if row and column index are both even or odd, then it's white; else it's black
        let color = rowIndex % 2 === colIndex % 2 ? "white" : "black";
        // create the new element in the dom
        let el = document.createElement("a-entity");
        // set the id of the new element : "sqa1", "sqc7", ...
        el.id = "sq" + col + row;
        // declare that the new element has the tile component
        el.setAttribute("tile", "name:" + el.id + ";color:" + color);
        // position is conveniently calculated based on the column and row index
        el.setAttribute("position", colIndex + 1 + " " + (rowIndex + 1) + " 0");
        // add the element to the board element
        self.el.appendChild(el);
        //console.log("board", el.object3D);
        arrTile[arrTile.length - 1].unshift({ pos: el, tipo: "normal" });
      });
    });
    //generateMap1();
  }
});
AFRAME.registerComponent("tile", {
  schema: {
    // name: tile name
    name: { type: "string", default: "" },
    // color: white|black
    color: { type: "string", default: "" }
  },
  init: function () {
    this.el.setAttribute("mixin", "tile");
    this.el.setAttribute("material", "color: " + this.data.color);
  }
});

let createdBoard = false;

AFRAME.registerSystem("anchors-system", {
  init: function () {
    const sceneEl = this.el;
    sceneEl.addEventListener("enter-vr", onEnterVR.bind(this));

    function onEnterVR() {
      if (!sceneEl.is("ar-mode")) return;

      const xrSystem = sceneEl.renderer.xr;
      const xrSession = xrSystem.getSession();

      xrSystem.addEventListener("sessionstart", async (ev) => {
        this.viewerSpace = await xrSession.requestReferenceSpace("viewer");
        this.refSpace = this.el.sceneEl.renderer.xr.getReferenceSpace();
        this.xrHitTestSource = await xrSession.requestHitTestSource({
          space: this.viewerSpace
        });
      });

      xrSession.addEventListener("select", onSelect.bind(this));

      this.tablero = document.querySelector("#tablero");
      this.reticle = document.querySelector("#reticle");

      this.reticle.setAttribute("visible", "false");

      this.hitTestAnchor = null;

      //Input events
      async function onSelect(e) {
        console.log(e); //XRInputSourceEvent
        const frame = e.frame;

        if (this.xrHitTestSource) {
          const hitTestResults = frame.getHitTestResults(this.xrHitTestSource);

          if (hitTestResults.length > 0) {
            const xrHitTestResult = hitTestResults[0];
            const anchor = await xrHitTestResult.createAnchor();
            this.hitTestAnchor = anchor;
          }
        }
      }
    }
  },

  tick: function () {
    const sceneEl = this.el;
    if (!sceneEl.is("ar-mode")) return;

    this.reticle.setAttribute("visible", "false");
    const frame = sceneEl.frame;

    if (frame && !createdBoard) {
      const viewerPose = frame.getViewerPose(this.refSpace);

      if (this.xrHitTestSource && viewerPose) {
        const hitTestResults = frame.getHitTestResults(this.xrHitTestSource);
        if (hitTestResults.length > 0) {
          const hitTestPose = hitTestResults[0].getPose(this.refSpace);

          ["x", "y", "z"].forEach((axis) => {
            this.reticle.object3D.position[axis] =
              hitTestPose.transform.position[axis];
          });

          this.reticle.object3D.quaternion.copy(
            hitTestPose.transform.orientation
          );
          this.reticle.setAttribute("visible", "true");
        }
      }

      if (frame.trackedAnchors.size > 0 && viewerPose) {
        if (
          this.hitTestAnchor &&
          frame.trackedAnchors.has(this.hitTestAnchor)
        ) {
          const anchor = this.hitTestAnchor;
          const anchorPose = frame.getPose(anchor.anchorSpace, this.refSpace);
          if (anchorPose) {
            ["x", "y", "z"].forEach((axis) => {
              this.tablero.object3D.position[axis] =
                anchorPose.transform.position[axis];
            });
            createdBoard = true;
          }
        }
      }
    }
  }
});

AFRAME.registerComponent("xr-tracked-image", {
  schema: {
    element: { type: "selector" },
    widthInMeters: { type: "number" },
    acc: { type: "string" }
  },
  init: function () {
    console.log("xr-tracked-image init");
    this.el.emit("register-xr-tracked-image", { node: this });
  }
});

AFRAME.registerSystem("xr-image-tracker", {
  init: function () {
    console.log("xr-tracked-images init");
    this.trackedNodesByImageIdNum = {};
    this.trackedImageList = [];
    this.trackedImagesPreviousFrame = {};
    this.el.sceneEl.systems.webxr.sessionConfiguration.trackedImages = this.trackedImageList;
    this.el.sceneEl.addEventListener(
      "register-xr-tracked-image",
      async (ev) => {
        let node = ev.detail.node;
        console.log("register", node);
        let trackedData = node.data;
        let bitmap = await createImageBitmap(trackedData.element);
        let idNum = this.trackedImageList.length;
        this.trackedImageList.push({
          image: bitmap,
          widthInMeters: trackedData.widthInMeters
        });
        this.trackedNodesByImageIdNum[idNum] = node;
      }
    );

    this.el.sceneEl.addEventListener("enter-vr", (ev) => {
      if (this.el.sceneEl.is("ar-mode")) {
        console.log("ar-mode start");

        let session = this.el.sceneEl.renderer.xr.getSession();
        let refSpaceType =
          this.el.sceneEl.systems.webxr.sessionReferenceSpaceType ||
          "local-floor";
        session.requestReferenceSpace(refSpaceType).then((space) => {
          this.refSpace = space;
        });
      }
    });
  },
  tick: function () {
    let session = this.el.sceneEl.renderer.xr.getSession();
    if (!session) return;
    let frame = this.el.sceneEl.frame;
    //console.log(this.el);
    let imagesTrackedThisFrame = {};
    let results = frame.getImageTrackingResults();
    for (let i = 0; i < results.length; ++i) {
      let result = results[i];
      let pose = frame.getPose(result.imageSpace, this.refSpace);
      let idNum = result.index;
      imagesTrackedThisFrame[idNum] = true;
      //console.log("pose", pose, "for image", idNum, " state=" + result.trackingState, " width=", result.measuredWidthInMeters);
      let node = this.trackedNodesByImageIdNum[idNum];
      if (!node) continue;

      for (let i = 0; i < node.el.children.length; i++) {
        node.el.children[i].setAttribute(
          "visible",
          result.trackingState == "tracked" ? true : false
        );
      }
      if (result.trackingState === "tracked")
        updateAction(
          node.el.object3D.el.components["xr-tracked-image"].attrValue
        );
      //console.log(pose);
      if (pose) {
        let object3D = node.el.object3D;
        //console.log(object3D.el.components["xr-tracked-image"].attrValue.x);

        object3D.visible = true;
        object3D.matrix.elements = pose.transform.matrix;
        object3D.matrix.decompose(
          object3D.position,
          object3D.rotation,
          object3D.scale
        );
      }
    }

    for (const index in this.imagesTrackedPreviousFrame) {
      if (!imagesTrackedThisFrame[index]) {
        this.trackedNodesByImageIdNum[index].el.object3D.visible = false;
      }
    }
    this.imagesTrackedPreviousFrame = imagesTrackedThisFrame;
  }
});

let movX = 0;
let movY = 0;
let movZ = -1;
let acc = "none";
function updateAction(val) {
  /*movX = val.x;
  movY = val.y;
  movZ = val.z;*/
  acc = val.acc;
  console.log(val.acc);
}
function forwPlayer(player) {
  player.position.x += Number(movX);
  player.position.z += Number(movZ);
  /*if (
    arrTile[player.position.x + 3.5][3.5 - player.position.z].tipo === "normal"
  ) {
    //controla si tiene que bajar
    player.position.y = 0.85;
  }*/
  checkTileHeight(player);
}
function checkMov(player) {
  //comprueba que el siguiente movimiento se pueda hacer
  let x = player.position.x + movX + 3.5;
  let y = 3.5 - player.position.z - movZ;
  console.log(x, y);
  if (0 <= x <= 7 && 0 <= y <= 7) {
    let nextPos = arrTile[x][y].tipo;
    if (
      nextPos === "normal" ||
      nextPos === "goal" ||
      nextPos === acc ||
      (nextPos === "jump" && player.position.y === 1.65)
    ) {
      document.getElementById("mapText").setAttribute("visible", false);
      return true;
    }
  }
  document.getElementById("mapText").setAttribute("visible", true);
  document.getElementById("mapText").setAttribute("value", "Accion no posible");
  return false;
}
let nextMap = 1;
let defMap = false;
function checkGoal(player) {
  //comprueba si llego a la meta
  if (
    arrTile[player.position.x + 3.5][3.5 - player.position.z].tipo === "goal"
  ) {
    document.getElementById("mapText").setAttribute("visible", true);
    document.getElementById("mapText").setAttribute("value", "Mapa Completado");
    document.getElementById("mapButton").style.display = "";
    document.getElementById("accButton").style.display = "none";
    document.getElementById("editButton").style.display = "";
    if (defMap) nextMap++;
  }
}
function playerMov(player) {
  let check = true;
  document.getElementById("mapText").setAttribute("visible", false);
  if (acc === "jump" || acc === "forw") check = checkMov(player);
  if (check) {
    switch (acc) {
      case "jump": // salta hacia delante
        //player.position.y = 1.65;
        forwPlayer(player);
        break;
      case "forw": // avanza hacia delante
        forwPlayer(player);
        break;
      case "rotL": // giro a izquierda
        if (movX === 0) {
          movX = movZ === -1 ? -1 : 1;
          movZ = 0;
        } else {
          movZ = movX === -1 ? 1 : -1;
          movX = 0;
        }
        player.rotation.y += Math.PI / 2;
        //forwPlayer(player);
        break;
      case "rotR": // giro a derecha
        if (movX === 0) {
          movX = movZ === -1 ? 1 : -1;
          movZ = 0;
        } else {
          movZ = movX === -1 ? -1 : 1;
          movX = 0;
        }
        player.rotation.y += -Math.PI / 2;
        break;

      case "none":
      default:
        document.getElementById("mapText").setAttribute("visible", true);
        document
          .getElementById("mapText")
          .setAttribute("value", "Accion no existente");
    }
  }
  checkGoal(player);
  /*player.position.x += Number(movX);
  player.position.y += Number(movY);
  player.position.z += Number(movZ);*/
  console.log(movX, movY, movZ);
}

let modo = "play";
let startX;
let startY;
let startTime;
let endX;
let endY;
const TIME_THRESHOLD = 200;
const SPACE_THRESHOLD = 150;
window.addEventListener("DOMContentLoaded", function () {
  const buttonAcc = document.getElementById("accButton");
  const buttonMap = document.getElementById("mapButton");
  const buttonEdit = document.getElementById("editButton");
  const buttonTile = document.getElementById("tileButton");
  const buttonStart = document.getElementById("startButton");

  const player = document.getElementById("player").object3D;
  const mapText = document.getElementById("mapText");

  buttonAcc.addEventListener("beforexrselect", (ev) => ev.preventDefault());
  buttonMap.addEventListener("beforexrselect", (ev) => ev.preventDefault());
  buttonEdit.addEventListener("beforexrselect", (ev) => ev.preventDefault());
  buttonTile.addEventListener("beforexrselect", (ev) => ev.preventDefault());
  buttonStart.addEventListener("beforexrselect", (ev) => ev.preventDefault());

  buttonMap.addEventListener("click", () => {
    buttonMap.style.display = "none";
    buttonEdit.style.display = "none";
    buttonAcc.style.display = "";
    mapText.setAttribute("visible", false);
    switch (nextMap) {
      case 1:
        generateMap1();
        break;
      default:
        mapText.setAttribute("visible", true);
        mapText.setAttribute("value", "No quedan mapas por defecto");
    }
  });
  buttonAcc.addEventListener("click", () => {
    playerMov(player);
    //arrTile[0].pos.setAttribute("visible", false);
    //jumpBox(5, 3);
    //.object3D.el.components.geometry = new THREE.SphereGeometry(); //.data.primitive = "cylinder";
    //console.log(document.getElementById("sq11").object3D);
    //console.log(player);
  });
  buttonEdit.addEventListener("click", () => {
    buttonMap.style.display = "none";
    buttonEdit.style.display = "none";
    buttonTile.style.display = "";
    buttonStart.style.display = "";
    plainMap();
    defMap = false;
    modo = "edit";
  });
  buttonTile.addEventListener("click", () => {
    changeTile(player);
  });
  buttonStart.addEventListener("click", () => {
    buttonTile.style.display = "none";
    buttonStart.style.display = "none";
    buttonAcc.style.display = "";
    modo = "play";
    player.position.x = 0.5;
    player.position.y = 0.85;
    player.position.z = 3.5;
  });

  //touchevents
  document.addEventListener(
    "touchstart",
    function (e) {
      if (modo === "edit" && createdBoard) {
        //e.preventDefault();
        startX = e.targetTouches[0].screenX;
        startY = e.targetTouches[0].screenY;
        //endX.current = e.targetTouches[0].screenX;
        //endY.current = e.targetTouches[0].screenY;
        startTime = e.timeStamp;
        console.log("START", startX, startY);
      }
    },
    { passive: false }
  );

  document.addEventListener(
    "touchmove",
    function (e) {
      if (modo === "edit" && createdBoard) {
        //e.preventDefault();
        endX = e.changedTouches[0].screenX;
        endY = e.changedTouches[0].screenY;
      }
    },
    { passive: false }
  );

  document.addEventListener("touchend", function (e) {
    console.log("END", endX, endY);
    console.log("TIEMPO", e.timeStamp - startTime);
    if (
      modo === "edit" &&
      createdBoard &&
      e.timeStamp - startTime < TIME_THRESHOLD
    ) {
      //e.preventDefault();
      //movimiento con gesto en pantalla.
      if (
        endX - startX > SPACE_THRESHOLD &&
        Math.abs(endY - startY) < SPACE_THRESHOLD
      ) {
        //acc derecha
        player.position.x += 1;
      } else if (
        startX - endX > SPACE_THRESHOLD &&
        Math.abs(endY - startY) < SPACE_THRESHOLD
      ) {
        //acc izq
        player.position.x += -1;
      } else if (
        endY - startY > SPACE_THRESHOLD &&
        Math.abs(endX - startX) < SPACE_THRESHOLD
      ) {
        //acc abajo
        player.position.z += 1;
      } else if (
        startY - endY > SPACE_THRESHOLD &&
        Math.abs(endX - startX) < SPACE_THRESHOLD
      ) {
        //acc arriba
        player.position.z += -1;
      }
      startX = 0;
      startY = 0;
      startTime = 0;
      endX = 0;
      endY = 0;
      checkTileHeight(player);
    }
  });
});
function checkTileHeight(player) {
  //posiciona al player a la altura necesaria para la casilla de debajo
  switch (arrTile[player.position.x + 3.5][3.5 - player.position.z].tipo) {
    case "jump":
      player.position.y = 1.65;
      break;
    case "high":
      player.position.y = 2.65;
      break;
    default:
      player.position.y = 0.85;
  }
}
function changeTile(player) {
  document.getElementById("mapText").setAttribute("visible", false);
  let x = player.position.x + 4.5;
  let y = 4.5 - player.position.z;
  console.log(x, y);
  switch (acc) {
    case "jumpB":
      player.position.y = 1.65;
      jumpBox(x, y);
      break;
    case "highB":
      player.position.y = 2.65;
      highBox(x, y);
      break;
    case "normalB":
      player.position.y = 0.85;
      normalBox(x, y);
      break;
    case "invisB":
      player.position.y = 0.85;
      invisBox(x, y);
      break;
    case "goalB":
      player.position.y = 0.85;
      goalBox(x, y);
      break;
    default:
      document.getElementById("mapText").setAttribute("visible", true);
      document
        .getElementById("mapText")
        .setAttribute("value", "Tipo de casilla no existente");
  }
}
function plainMap() {
  //reinicia el mapa poniendo todas las casillas normales
  arrTile.forEach((line, y) => {
    line.forEach((box, x) => {
      box.tipo = "normal";
      box.pos.setAttribute("visible", true);
      box.pos.setAttribute(
        "material",
        "color",
        (x + y) % 2 === 0 ? "black" : "white"
      );
      box.pos.setAttribute("position", {
        x: box.pos.getAttribute("position").x,
        y: box.pos.getAttribute("position").y,
        z: 0
      });
      box.pos.setAttribute("geometry", "depth: 0.2");
      //x++;
    });
  });
}
function generateMap1() {
  plainMap();
  defMap = true;
  for (let i = 1; i < 4; i++) {
    for (let j = 1; j < 9; j++) {
      invisBox(i, j);
    }
  }
  //console.log("xd---------", arrTile[5][1].pos.getAttribute("position"));
  jumpBox(5, 3);
  highBox(6, 3);
  highBox(4, 5);
  highBox(5, 5);
  highBox(5, 7);
  highBox(6, 7);
  jumpBox(4, 6);
  goalBox(4, 8);
}
function jumpBox(x, y) {
  let box = arrTile[x - 1][y - 1].pos;
  arrTile[x - 1][y - 1].tipo = "jump";
  box.setAttribute("visible", true);
  box.setAttribute("material", "color", (x + y) % 2 === 0 ? "black" : "white");
  box.setAttribute("position", {
    x: box.getAttribute("position").x,
    y: box.getAttribute("position").y,
    z: -0.4
  });
  box.setAttribute("geometry", "depth: 1");
}
function invisBox(x, y) {
  let box = arrTile[x - 1][y - 1].pos;
  arrTile[x - 1][y - 1].tipo = "invis";
  box.setAttribute("visible", false);
}
function highBox(x, y) {
  let box = arrTile[x - 1][y - 1].pos;
  console.log("pruebas---------", box.getAttribute("position"));
  arrTile[x - 1][y - 1].tipo = "high";
  box.setAttribute("visible", true);
  box.setAttribute("material", "color", (x + y) % 2 === 0 ? "black" : "white");
  box.setAttribute("position", {
    x: box.getAttribute("position").x,
    y: box.getAttribute("position").y,
    z: -0.9
  });
  box.setAttribute("geometry", "depth: 2");
}
function goalBox(x, y) {
  let box = arrTile[x - 1][y - 1].pos;
  arrTile[x - 1][y - 1].tipo = "goal";
  box.setAttribute("visible", true);
  box.setAttribute("material", "color", "green");
  box.setAttribute("position", {
    x: box.getAttribute("position").x,
    y: box.getAttribute("position").y,
    z: 0
  });
  box.setAttribute("geometry", "depth: 0.2");
}
function normalBox(x, y) {
  let box = arrTile[x - 1][y - 1].pos;
  arrTile[x - 1][y - 1].tipo = "normal";
  box.setAttribute("visible", true);
  box.setAttribute("material", "color", (x + y) % 2 === 0 ? "black" : "white");
  box.setAttribute("position", {
    x: box.getAttribute("position").x,
    y: box.getAttribute("position").y,
    z: 0
  });
  box.setAttribute("geometry", "depth: 0.2");
}
