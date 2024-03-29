import { useEffect, useState } from "react";
import * as signalR from "@microsoft/signalr";
import "./App.css";
import { useRef } from "react";
import { Snackbar } from "@mui/material";

function App() {
  const [ready, setReady] = useState();
  const [remoteReady, setRemoteReady] = useState();
  const [incomingCall, setIncomingCall] = useState();
  const [outgoingCall, setOutgoingCall] = useState();
  const [currentCall, setCurrentCall] = useState();
  const [message, setMessage] = useState();
  const localStream = useRef();
  const localVideo = useRef();
  const remoteVideo = useRef();
  const readyInterval = useRef();

  const pc = useRef();
  const hub = useRef(
    new signalR.HubConnectionBuilder()
      .withUrl("https://mnordberg-rtc-demo.azurewebsites.net/hub")
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Debug)
      .build()
  );

  const iceConfiguration = {
    iceServers: [
      {
        urls: "turn:20.64.146.240:3478",
        username: "test",
        credential: "test123",
      },
    ],
  };

  useEffect(() => {
    if (hub.current.state == "Disconnected") {
      hub.current.start();

      // Message needs to be parsed since we're using SignalR with Json
      hub.current.on("Message", (e) => handleMessage(JSON.parse(e)));
    }
  }, []);

  function handleMessage(e) {
    if (e.connectionId == hub.current.connectionId) {
      return;
    }
    switch (e.type) {
      case "offer":
        handleOffer(e.data);
        break;
      case "answer":
        handleAnswer(e.data);
        break;
      case "candidate":
        handleCandidate(e.data);
        break;
      case "ready":
        handleReady();
        break;
      case "end":
        end(false);
        break;
      default:
        handleError(`Unhandled event: ${e.type}`);
        break;
    }
  }

  async function start() {
    localStream.current = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });
    localVideo.current.srcObject = localStream.current;
    setReady(true);
    readyInterval.current = setInterval(() => {
      sendMessage("ready");
    }, 5000);
  }

  async function end(endedByMe) {
    if (pc.current) {
      pc.current.close();
      pc.current = null;
    }

    remoteVideo.current.srcObject = null;
    setCurrentCall(false);
    if (endedByMe) {
      sendMessage("end");
    }

    // TODO: allow user to stop as a separate action
    await stop();
  }

  async function stop() {
    localStream.current.getTracks().forEach((track) => track.stop());
    localStream.current = null;
    localVideo.current.srcObject = null;
    setReady(false);
    clearInterval(readyInterval.current);
  }

  function createPeerConnection() {
    pc.current = new RTCPeerConnection(iceConfiguration);
    pc.current.onicecandidate = (e) => {
      sendMessage("candidate", e.candidate || null);
    };
    pc.current.ontrack = (e) => (remoteVideo.current.srcObject = e.streams[0]);
    if (!localStream.current) {
      handleError("Local stream not ready");
    }
    localStream.current
      .getTracks()
      .forEach((track) => pc.current.addTrack(track, localStream.current));
  }

  async function call() {
    await createPeerConnection();

    const offer = await pc.current.createOffer();
    sendMessage("offer", offer);
    await pc.current.setLocalDescription(offer);
    setOutgoingCall(true);
  }

  async function answer(offer) {
    const answer = await pc.current.createAnswer();
    sendMessage("answer", answer);
    await pc.current.setLocalDescription(answer);
    setIncomingCall(false);
    setCurrentCall(true);
  }

  async function handleOffer(offer) {
    if (pc.current) {
      handleError("Cannot connect when existing peer connection is in place.");
      return;
    }
    await createPeerConnection();
    await pc.current.setRemoteDescription(offer);
    setIncomingCall(true);

    // TODO: let user answer manually
    await answer(offer);
  }

  async function handleAnswer(answer) {
    if (!pc.current) {
      handleError("Cannot handle answer. No peer connection is in place.");
      return;
    }
    await pc.current.setRemoteDescription(answer);
    setOutgoingCall(false);
    setCurrentCall(true);
  }

  async function handleCandidate(candidate) {
    if (!pc.current) {
      handleError("Cannot handle candidate. No peer connection is in place.");
      return;
    }
    console.debug(`Adding ICE candidate: \n${candidate?.candidate}`);
    if (!candidate?.candidate) {
      await pc.current.addIceCandidate(null);
    } else {
      await pc.current.addIceCandidate(candidate);
    }
  }

  async function handleReady() {
    setRemoteReady(true);
  }

  function test() {
    sendMessage("test");
  }

  async function sendMessage(type, data) {
    hub.current.send("Message", {
      type: type,
      data: data,
      connectionId: hub.current.connectionId,
    });
  }

  function handleError(error) {
    console.error(error);
    popMessage(error);
  }

  function popMessage(msg) {
    // Pop a snackbar, then remove the message after the snackbar disappears
    setMessage(msg);
    setTimeout(() => setMessage(null), 10000);
  }

  return (
    <>
      <h1>WebRTC + React</h1>
      <div className="card">
        <div style={{ position: "relative" }}>
          <video
            id="remoteVideo"
            ref={remoteVideo}
            hidden={!currentCall}
            style={{
              borderRadius: "1rem",
              width: "60vw",
            }}
            playsInline
            autoPlay
          ></video>
          <video
            id="localVideo"
            ref={localVideo}
            hidden={!ready}
            style={
              currentCall
                ? {
                    borderRadius: "0.6rem",
                    width: "12vw",
                    position: "absolute",
                    right: "-1rem",
                    bottom: "-1rem",
                    transition: "all 500ms ease-in-out",
                  }
                : {
                    borderRadius: "1rem",
                    width: "60vw",
                    position: "static",
                    transition: "all 500ms ease-in-out",
                  }
            }
            playsInline
            autoPlay
            muted
          ></video>
        </div>
        <div
          style={{
            display: "flex",
            gap: "1rem",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          <button id="startButton" onClick={start} disabled={!!ready}>
            Start
          </button>
          <button
            id="callButton"
            onClick={call}
            disabled={
              !ready ||
              !remoteReady ||
              currentCall ||
              incomingCall ||
              outgoingCall
            }
          >
            Call
          </button>
          <button id="endButton" onClick={() => end(true)} disabled={!ready}>
            End
          </button>
          <button id="testButton" onClick={() => test()}>
            Test
          </button>
        </div>
      </div>
      <Snackbar message={message} open={!!message} autoHideDuration={6000} />
    </>
  );
}

export default App;
