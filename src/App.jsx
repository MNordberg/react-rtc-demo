import { useState } from "react";
import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";
import "./App.css";
import { useRef } from "react";

function App() {
  const [localStream, setLocalStream] = useState();
  const [startTime, setStartTime] = useState();
  const localVideo = useRef();

  const localPeer = useRef();
  const remotePeer = useRef();

  async function start() {
    console.log("Requesting local stream");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
      console.log("Received local stream");
      setLocalStream(stream);
      localVideo.current.srcObject = stream;
    } catch (e) {
      alert(`${e.message || e.name}`);
    }
  }

  async function call() {
    console.log("Starting call");
    setStartTime(window.performance.now());
    const videoTracks = localStream.getVideoTracks();
    const audioTracks = localStream.getAudioTracks();
    if (videoTracks.length > 0) {
      console.log(`Using video device: ${videoTracks[0].label}`);
    }
    if (audioTracks.length > 0) {
      console.log(`Using audio device: ${audioTracks[0].label}`);
    }
    const iceConfiguration = {
      iceServers: [
        {
          urls: "turn:20.64.146.240:3478",
          username: "test",
          credential: "test123",
        },
      ],
    };
    console.log("RTCPeerConnection configuration:", iceConfiguration);
    localPeer.current = new RTCPeerConnection(iceConfiguration);
    localPeer.current.addEventListener("icecandidate", (e) =>
      onIceCandidate(localPeer.current, e)
    );
    localPeer.current.addEventListener("iceconnectionstatechange", (e) =>
      onIceStateChange(localPeer.current, e)
    );
    remotePeer.current = new RTCPeerConnection(iceConfiguration);
    remotePeer.current.addEventListener("icecandidate", (e) =>
      onIceCandidate(remotePeer.current, e)
    );
    remotePeer.current.addEventListener("iceconnectionstatechange", (e) =>
      onIceStateChange(remotePeer.current, e)
    );
    remotePeer.current.addEventListener("track", gotRemoteStream);
    localStream
      .getTracks()
      .forEach((track) => localPeer.current.addTrack(track, localStream));
    console.log("Added local stream to local peer");

    try {
      console.log("Local peer: createOffer start");
      const offer = await localPeer.current.createOffer({
        offerToReceiveAudio: 1,
        offerToReceiveVideo: 1,
      });
      await onCreateOfferSuccess(offer);
    } catch (e) {
      onCreateSessionDescriptionError(e);
    }
  }

  function onCreateSessionDescriptionError(error) {
    console.log(`Failed to create session description: ${error.toString()}`);
  }

  function onSetSessionDescriptionError(error) {
    console.log(`Failed to set session description: ${error.toString()}`);
  }

  async function onCreateOfferSuccess(desc) {
    console.log(`Offer from local peer\n${desc.sdp}`);
    console.log("Local peer setLocalDescription start");
    try {
      await localPeer.current.setLocalDescription(desc);
      onSetLocalSuccess(localPeer.current);
    } catch (e) {
      onSetSessionDescriptionError();
    }

    console.log("Remote peer setRemoteDescription start");
    try {
      await remotePeer.current.setRemoteDescription(desc);
      onSetRemoteSuccess(remotePeer.current);
    } catch (e) {
      onSetSessionDescriptionError();
    }

    console.log("Remote peer createAnswer start");
    // Since the 'remote' side has no media stream we need
    // to pass in the right constraints in order for it to
    // accept the incoming offer of audio and video.
    try {
      const answer = await remotePeer.current.createAnswer();
      await onCreateAnswerSuccess(answer);
    } catch (e) {
      onCreateSessionDescriptionError(e);
    }
  }

  function onSetLocalSuccess(peer) {
    console.log(`${getName(peer)} setLocalDescription complete`);
  }

  function onSetRemoteSuccess(pc) {
    console.log(`${getName(pc)} setRemoteDescription complete`);
  }

  async function onIceCandidate(peer, event) {
    try {
      await getOtherPeer(peer).addIceCandidate(event.candidate);
      onAddIceCandidateSuccess(peer);
    } catch (e) {
      onAddIceCandidateError(peer, e);
    }
    console.log(
      `${getName(peer)} ICE candidate:\n${
        event.candidate ? event.candidate.candidate : "(null)"
      }`
    );
  }

  function getName(peer) {
    return peer === localPeer.current ? "Local peer" : "Remote peer";
  }

  function getOtherPeer(peer) {
    return peer === localPeer.current ? remotePeer.current : localPeer.current;
  }

  function onAddIceCandidateSuccess(peer) {
    console.log(`${getName(peer)} addIceCandidate success`);
  }

  function onAddIceCandidateError(peer, error) {
    console.log(
      `${getName(peer)} failed to add ICE Candidate: ${error.toString()}`
    );
  }

  function gotRemoteStream(e) {
    if (remoteVideo.srcObject !== e.streams[0]) {
      remoteVideo.srcObject = e.streams[0];
      console.log("Added remote stream to remote peer");
    }
  }

  async function onCreateAnswerSuccess(desc) {
    console.log(`Answer from remote peer:\n${desc.sdp}`);
    console.log("Remote peer setLocalDescription start");
    try {
      await remotePeer.current.setLocalDescription(desc);
      onSetLocalSuccess(remotePeer.current);
    } catch (e) {
      onSetSessionDescriptionError(e);
    }
    console.log("Local peer setRemoteDescription start");
    try {
      await localPeer.current.setRemoteDescription(desc);
      onSetRemoteSuccess(localPeer.current);
    } catch (e) {
      onSetSessionDescriptionError(e);
    }
  }

  function onIceStateChange(peer, event) {
    if (peer) {
      console.log(`${getName(peer)} ICE state: ${peer.iceConnectionState}`);
      console.log("ICE state change event: ", event);
    }
  }

  function end() {
    console.log("Ending call and closing local stream");
    if (localPeer.current) {
      localPeer.current.close();
      localPeer.current = null;
    }
    if (remotePeer.current) {
      remotePeer.current.close();
      remotePeer.current = null;
    }
    if (remoteVideo.current) {
      remoteVideo.current.srcObject = null;
    }
    setLocalStream(null);
  }

  return (
    <>
      <h1>WebRTC + React</h1>
      <div className="card">
        <video
          id="localVideo"
          ref={localVideo}
          playsInline
          autoPlay
          muted
        ></video>
        <video id="remoteVideo" playsInline autoPlay></video>
        <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
          <button id="startButton" onClick={start} disabled={!!localStream}>
            Start
          </button>
          <button id="callButton" onClick={call}>
            Call
          </button>
          <button
            id="hangupButton"
            onClick={() => end()}
            disabled={!localStream}
          >
            End
          </button>
        </div>
      </div>
    </>
  );
}

export default App;
