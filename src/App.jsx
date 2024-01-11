import { useEffect, useState } from "react";
import * as signalR from "@microsoft/signalr";
import "./App.css";
import { useRef } from "react";
import { Snackbar } from "@mui/material";

function App() {
  const [ready, setReady] = useState();
  const [remoteReady, setRemoteReady] = useState();
  const [currentCall, setCurrentCall] = useState();
  const [message, setMessage] = useState();
  const localStream = useRef();
  const localVideo = useRef();
  const remoteVideo = useRef();

  const pc = useRef();
  const hub = useRef(
    new signalR.HubConnectionBuilder()
      .withUrl("https://mnordberg-rtc-demo.azurewebsites.net/hub")
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Debug)
      .build()
  );

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
    sendMessage("ready");
  }

  async function end(notify) {
    if (pc.current) {
      pc.current.close();
      pc.current = null;
    }
    localStream.current.getTracks().forEach((track) => track.stop());
    localStream.current = null;
    localVideo.current.srcObject = null;
    remoteVideo.current.srcObject = null;
    setCurrentCall(false);
    if (notify) {
      sendMessage("end");
    }
  }

  function createPeerConnection() {
    pc.current = new RTCPeerConnection();
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
  }

  async function handleOffer(offer) {
    if (pc.current) {
      handleError("Cannot connect when existing peer connection is in place.");
      return;
    }
    await createPeerConnection();
    await pc.current.setRemoteDescription(offer);

    const answer = await pc.current.createAnswer();
    sendMessage("answer", answer);
    await pc.current.setLocalDescription(answer);
    setCurrentCall(true);
  }

  async function handleAnswer(answer) {
    if (!pc.current) {
      handleError("Cannot handle answer. No peer connection is in place.");
      return;
    }
    await pc.current.setRemoteDescription(answer);
    setCurrentCall(true);
  }

  async function handleCandidate(candidate) {
    if (!pc.current) {
      handleError("Cannot handle candidate. No peer connection is in place.");
      return;
    }
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
        <video
          id="localVideo"
          ref={localVideo}
          hidden={!ready}
          playsInline
          autoPlay
          muted
        ></video>
        <video
          id="remoteVideo"
          ref={remoteVideo}
          hidden={!remoteReady}
          playsInline
          autoPlay
        ></video>
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
            disabled={!ready || !remoteReady || currentCall}
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
