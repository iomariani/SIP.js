/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-use-before-define */
import { Session } from "../lib/index.js";
import { SessionManager } from "../lib/platform/web/index.js";
import { SessionManagerDelegate } from "../lib/platform/web/index.js";
import {
  WebAudioSessionDescriptionHandler,
  SessionManagerOptions,
  startLocalConference,
  defaultMediaStreamFactory,
  defaultPeerConnectionConfiguration
} from "../lib/platform/web/index.js";
import {
  nameAlice,
  nameBob,
  nameJohn,
  uriAlice,
  uriBob,
  uriJohn,
  webSocketServerAlice,
  webSocketServerBob,
  webSocketServerJohn
} from "./demo-users.js";
import { getButton, getAudio } from "./demo-utils.js";

const connectAlice = getButton("connectAlice");
const connectBob = getButton("connectBob");
const connectJohn = getButton("connectJohn");
const disconnectAlice = getButton("disconnectAlice");
const disconnectBob = getButton("disconnectBob");
const disconnectJohn = getButton("disconnectJohn");
const registerAlice = getButton("registerAlice");
const registerBob = getButton("registerBob");
const registerJohn = getButton("registerJohn");
const unregisterAlice = getButton("unregisterAlice");
const unregisterBob = getButton("unregisterBob");
const unregisterJohn = getButton("unregisterJohn");
const endAlice = getButton("endAlice");
const endBob = getButton("endBob");
const endJohn = getButton("endJohn");
const audioRemoteAlice = getAudio("audioRemoteAlice");
const audioRemoteBob = getAudio("audioRemoteBob");
const audioRemoteJohn = getAudio("audioRemoteJohn");

// New SimpleUserWithDataChannel for Alice
const alice = buildUser(
  webSocketServerAlice,
  uriAlice,
  nameAlice,
  connectAlice,
  disconnectAlice,
  registerAlice,
  unregisterAlice,
  endAlice,
  audioRemoteAlice,
  getButton("createSessions"),
  getButton("joinSessions"),
  [
    {
      aor: uriBob,
      name: nameBob
    },
    {
      aor: uriJohn,
      name: nameJohn
    }
  ]
);

// New SimpleUserWithDataChannel for Bob
const bob = buildUser(
  webSocketServerBob,
  uriBob,
  nameBob,
  connectBob,
  disconnectBob,
  registerBob,
  unregisterBob,
  endBob,
  audioRemoteBob
);

const john = buildUser(
  webSocketServerJohn,
  uriJohn,
  nameJohn,
  connectJohn,
  disconnectJohn,
  registerJohn,
  unregisterJohn,
  endJohn,
  audioRemoteJohn
);

if (!alice || !bob || !john) {
  console.error("Something went wrong");
}

type Target = {
  aor: string;
  name: string;
};

function buildUser(
  webSocketServer: string,
  aor: string,
  displayName: string,
  connectButton: HTMLButtonElement,
  disconnectButton: HTMLButtonElement,
  registerButton: HTMLButtonElement,
  unregisterButton: HTMLButtonElement,
  endButton: HTMLButtonElement,
  audioRemoteElement: HTMLAudioElement,
  beginButton: HTMLButtonElement | null = null,
  joinButton?: HTMLButtonElement,
  targets?: Target[]
): SessionManager {
  console.log(`Creating "${name}" <${aor}>...`);

  const options: SessionManagerOptions = {
    aor,
    media: {
      constraints: {
        // This demo is making "audio only" calls
        audio: true,
        video: false
      },
      remote: {
        audio: audioRemoteElement
      }
    },
    userAgentOptions: {
      // logLevel: "debug",
      logBuiltinEnabled: false,
      displayName,
      sessionDescriptionHandlerFactory(session, options) {
        const logger = session.userAgent.getLogger("sip.SessionDescriptionHandler");
        const mediaStreamFactory = defaultMediaStreamFactory();

        const sessionDescriptionHandlerConfiguration = {
          iceGatheringTimeout: 500,
          peerConnectionConfiguration: defaultPeerConnectionConfiguration(),
          ...options
        };

        return new WebAudioSessionDescriptionHandler(
          logger,
          mediaStreamFactory,
          sessionDescriptionHandlerConfiguration
        );
      }
    }
  };

  // Create SessionManager
  const sessionManager = new SessionManager(webSocketServer, options);

  // SimpleUser delegate
  const delegate: SessionManagerDelegate = {
    onCallAnswered(session) {
      console.log(`[${displayName}.${session.id}] call answered`);

      const stream = sessionManager.getLocalMediaStream(session);
      const sdh = session.sessionDescriptionHandler;

      if (stream && sdh instanceof WebAudioSessionDescriptionHandler) {
        sdh.initLocalMediaStream(stream);
      }

      if (sessionManager.managedSessions.length > 1 && joinButton) {
        joinButton.disabled = false;
      }
    },
    onCallCreated: makeCallCreatedCallback(sessionManager, beginButton, endButton),
    onCallReceived: makeCallReceivedCallback(sessionManager),
    onCallHangup: makeCallHangupCallback(sessionManager, beginButton, endButton),
    onRegistered: makeRegisteredCallback(sessionManager, registerButton, unregisterButton),
    onUnregistered: makeUnregisteredCallback(sessionManager, registerButton, unregisterButton),
    onServerConnect: makeServerConnectCallback(
      sessionManager,
      connectButton,
      disconnectButton,
      registerButton,
      beginButton
    ),
    onServerDisconnect: makeServerDisconnectCallback(
      sessionManager,
      connectButton,
      disconnectButton,
      registerButton,
      beginButton,
      joinButton
    )
  };
  sessionManager.delegate = delegate;

  // Setup connect button click listeners
  connectButton.addEventListener(
    "click",
    makeConnectButtonClickListener(sessionManager, connectButton, disconnectButton, registerButton, beginButton)
  );

  // Setup disconnect button click listeners
  disconnectButton.addEventListener(
    "click",
    makeDisconnectButtonClickListener(sessionManager, connectButton, disconnectButton, registerButton, beginButton)
  );

  // Setup register button click listeners
  registerButton.addEventListener("click", makeRegisterButtonClickListener(sessionManager, registerButton));

  // Setup unregister button click listeners
  unregisterButton.addEventListener("click", makeUnregisterButtonClickListener(sessionManager, unregisterButton));

  // Setup end button click listeners
  endButton.addEventListener("click", makeEndButtonClickListener(sessionManager));

  // Enable connect button
  connectButton.disabled = false;

  if (joinButton && targets && beginButton) {
    joinButton.disabled = true;
    joinButton.addEventListener("click", makeJoinButtonClickListener(sessionManager, joinButton, audioRemoteElement));
    beginButton.addEventListener("click", makeBeginButtonClickListener(sessionManager, beginButton, targets));
  }

  return sessionManager;
}

// Helper function to create call received callback
function makeCallReceivedCallback(manager: SessionManager): (session: Session) => void {
  return (session) => {
    const { displayName } = manager.userAgent.configuration;

    console.log(`[${session.id}] call received`);

    manager.answer(session).catch((error: Error) => {
      console.error(`[${displayName}] failed to answer call`);
      console.error(error);
      alert(`[${displayName}] Failed to answer call.\n` + error);
    });
  };
}

// Helper function to create call created callback
function makeCallCreatedCallback(
  sessionManager: SessionManager,
  beginButton: HTMLButtonElement | null,
  endButton: HTMLButtonElement
): (session: Session) => void {
  return (session) => {
    console.log(`[${session.id}] call created`);
    if (beginButton) {
      beginButton.disabled = true;
    }
    endButton.disabled = false;
  };
}

// Helper function to create call hangup callback
function makeCallHangupCallback(
  sessionManager: SessionManager,
  beginButton: HTMLButtonElement | null,
  endButton: HTMLButtonElement
): (session: Session) => void {
  return (session) => {
    console.log(`[${session.id}] call hangup`);
    if (beginButton) {
      beginButton.disabled = !session.userAgent.isConnected();
    }
    endButton.disabled = true;
  };
}

// Helper function to create registered callback
function makeRegisteredCallback(
  sessionManager: SessionManager,
  registerButton: HTMLButtonElement,
  unregisterButton: HTMLButtonElement
): () => void {
  const { displayName } = sessionManager.userAgent.configuration;

  return () => {
    console.log(`[${displayName}] registered`);
    registerButton.disabled = true;
    unregisterButton.disabled = false;
  };
}

// Helper function to create unregistered callback
function makeUnregisteredCallback(
  sessionManager: SessionManager,
  registerButton: HTMLButtonElement,
  unregisterButton: HTMLButtonElement
): () => void {
  const { displayName } = sessionManager.userAgent.configuration;

  return () => {
    console.log(`[${displayName}] unregistered`);
    registerButton.disabled = !sessionManager.userAgent.isConnected();
    unregisterButton.disabled = true;
  };
}

// Helper function to create network connect callback
function makeServerConnectCallback(
  sessionManager: SessionManager,
  connectButton: HTMLButtonElement,
  disconnectButton: HTMLButtonElement,
  registerButton: HTMLButtonElement,
  beginButton: HTMLButtonElement | null
): () => void {
  const { displayName } = sessionManager.userAgent.configuration;

  return () => {
    console.log(`[${displayName}] connected`);
    connectButton.disabled = true;
    disconnectButton.disabled = false;
    registerButton.disabled = false;
    if (beginButton) {
      beginButton.disabled = false;
    }
  };
}

// Helper function to create network disconnect callback
function makeServerDisconnectCallback(
  sessionManager: SessionManager,
  connectButton: HTMLButtonElement,
  disconnectButton: HTMLButtonElement,
  registerButton: HTMLButtonElement,
  beginButton: HTMLButtonElement | null,
  joinButton?: HTMLButtonElement
): () => void {
  return (error?: Error) => {
    const { displayName } = sessionManager.userAgent.configuration;

    console.log(`[${displayName}] disconnected`);
    connectButton.disabled = false;
    disconnectButton.disabled = true;
    registerButton.disabled = true;

    if (beginButton) {
      beginButton.disabled = true;
    }

    if (joinButton) {
      joinButton.disabled = true;
    }

    if (error) {
      alert(`[${displayName}] Server disconnected.\n` + error.message);
    }
  };
}

// Helper function to setup click handler for connect button
function makeConnectButtonClickListener(
  sessionManager: SessionManager,
  connectButton: HTMLButtonElement,
  disconnectButton: HTMLButtonElement,
  registerButton: HTMLButtonElement,
  beginButton: HTMLButtonElement | null
): () => void {
  const { displayName } = sessionManager.userAgent.configuration;

  return () => {
    sessionManager
      .connect()
      .then(() => {
        connectButton.disabled = true;
        disconnectButton.disabled = false;
        registerButton.disabled = false;
        if (beginButton) {
          beginButton.disabled = false;
        }
      })
      .catch((error: Error) => {
        console.error(`[${displayName}] failed to connect`);
        console.error(error);
        alert(`[${displayName}] Failed to connect.\n` + error);
      });
  };
}

// Helper function to setup click handler for disconnect button
function makeDisconnectButtonClickListener(
  sessionManager: SessionManager,
  connectButton: HTMLButtonElement,
  disconnectButton: HTMLButtonElement,
  registerButton: HTMLButtonElement,
  beginButton: HTMLButtonElement | null
): () => void {
  const { displayName } = sessionManager.userAgent.configuration;

  return () => {
    sessionManager
      .disconnect()
      .then(() => {
        connectButton.disabled = false;
        disconnectButton.disabled = true;
        registerButton.disabled = true;
        if (beginButton) {
          beginButton.disabled = true;
        }
      })
      .catch((error: Error) => {
        console.error(`[${displayName}] failed to disconnect`);
        console.error(error);
        alert(`[${displayName}] Failed to disconnect.\n` + error);
      });
  };
}

// Helper function to setup click handler for register button
function makeRegisterButtonClickListener(
  sessionManager: SessionManager,
  registerButton: HTMLButtonElement
): () => void {
  return () => {
    sessionManager
      .register({
        // An example of how to get access to a SIP response message for custom handling
        requestDelegate: {
          onReject: (response) => {
            console.warn(`[${sessionManager.userAgent.configuration.displayName}] REGISTER rejected`);
            let message = `Registration of "${sessionManager.userAgent.configuration.displayName}" rejected.\n`;
            message += `Reason: ${response.message.reasonPhrase}\n`;
            alert(message);
          }
        }
      })
      .then(() => {
        registerButton.disabled = true;
      })
      .catch((error: Error) => {
        console.error(`[${sessionManager.userAgent.configuration.displayName}] failed to register`);
        console.error(error);
        alert(`[${sessionManager.userAgent.configuration.displayName}] Failed to register.\n` + error);
      });
  };
}

// Helper function to setup click handler for unregister button
function makeUnregisterButtonClickListener(
  sessionManager: SessionManager,
  unregisterButton: HTMLButtonElement
): () => void {
  const { displayName } = sessionManager.userAgent.configuration;

  return () => {
    sessionManager
      .unregister()
      .then(() => {
        unregisterButton.disabled = true;
      })
      .catch((error: Error) => {
        console.error(`[${displayName}] failed to unregister`);
        console.error(error);
        alert(`[${displayName}] Failed to unregister.\n` + error);
      });
  };
}

// Helper function to setup click handler for begin button
function makeBeginButtonClickListener(
  sessionManager: SessionManager,
  beginButton: HTMLButtonElement,
  targets: Target[]
): () => void {
  const { displayName } = sessionManager.userAgent.configuration;

  return () => {
    targets.forEach((target) => {
      sessionManager
        .call(
          target.aor,
          {},
          {
            // An example of how to get access to a SIP response message for custom handling
            requestDelegate: {
              onReject: (response) => {
                console.warn(`[${displayName}] INVITE rejected`);
                let message = `Session invitation to "${target.name}" rejected.\n`;
                message += `Reason: ${response.message.reasonPhrase}\n`;
                message += `Perhaps "${target.name}" is not connected or registered?\n`;
                alert(message);
              }
            }
          }
        )
        .catch((error: Error) => {
          console.error(`[${displayName}] failed to begin session`);
          console.error(error);
          alert(`[${displayName}] Failed to begin session.\n` + error);
        });
    });

    beginButton.disabled = true;
  };
}

// Helper function to setup click handler for begin button
function makeEndButtonClickListener(sessionManager: SessionManager): () => void {
  const { displayName } = sessionManager.userAgent.configuration;

  return () => {
    sessionManager.managedSessions.forEach(({ session }) => {
      sessionManager.hangup(session).catch((error: Error) => {
        console.error(`[${displayName}.${session.id}] failed to end session`);
        console.error(error);
        alert(`[${displayName}.${session.id}] Failed to end session.\n` + error);
      });
    });
  };
}

// Helper function to setup click handler for join button
function makeJoinButtonClickListener(
  sessionManager: SessionManager,
  joinButton: HTMLButtonElement,
  audioRemoteElement: HTMLAudioElement
): () => void {
  return () => {
    const sessions = sessionManager.managedSessions.map(({ session }) => session);

    console.log("Joining sessions:", ...sessions.map((s) => `${s.userAgent.configuration.displayName}.${s.id}`));

    joinButton.disabled = true;

    const [firstSession] = sessions;

    startLocalConference(sessions);

    console.log("Sessions joined.");

    const remoteStream = sessionManager.getRemoteMediaStream(firstSession);
    if (!remoteStream) {
      throw new Error("Remote media stream undefiend.");
    }

    audioRemoteElement.autoplay = true; // Safari hack, because you cannot call .play() from a non user action
    audioRemoteElement.srcObject = remoteStream;
    audioRemoteElement.play().catch((error) => {
      console.error(`[${firstSession.id}] Failed to play remote media`);
      console.error(error.message);
    });

    remoteStream.onaddtrack = () => {
      console.log(`Remote media onaddtrack`);
      audioRemoteElement.load(); // Safari hack, as it doesn't work otheriwse
      audioRemoteElement.play().catch((error) => {
        console.error(`[${firstSession.id}] Failed to play remote media`);
        console.error(error.message);
      });
    };
  };
}
