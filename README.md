# WebRTC Library for Video Calls, Screen Sharing, and File Sharing

This open-source library aims to simplify the implementation of WebRTC features, such as video calls, screen sharing, file sharing, etc., in frontend applications like Angular, React, Vue, and others.

## Getting Started

- **Install the library via npm:**
   ```bash
   npm i easy-call-js

*   **Use your framework’s dependency injection mechanism** to inject the CallProcessService API with its dependencies, which include:

    *   The default signaling server implementation based on Firestore, which requires your own Firebase configuration.

    *   Your ICE servers configuration.

    *   Multimedia constraints for your devices, such as the desired video size, etc.


Using the Main Methods
----------------------

### 1\. Starting a Call

To start a call, simply call the initializeCall method, which takes as input:

*   The caller's ID

*   The list of users to contact


This method notifies the callees and returns an ID for the call.

### 2\. Initiating the Call with launchCall

This ID is then passed to the launchCall method with a CallParam object. This object contains:

*   The list of users to join

*   The ID of the user initiating the call

*   The ID of the video tag where the caller’s video will be displayed

*   The ID of the tag where the other participants' videos will be added


### 3\. Detect Incoming Calls

The trackCall method allows you to detect incoming calls.

### 4\. Leaving a Call

The releaseCall method allows you to leave the call.

### 5\. Manage Participant Exits

The handleLeaveCall method notifies you whenever a user leaves the call. This can be useful, for example, to remove that participant's video from the screen.

### 6\. Remove a Participant's Video

The removeParticipantVideo method removes from the screen the video of the user whose ID is passed as a parameter.

### 7\. Answer a Call

The takeCall method allows you to answer the call once trackCall has detected it. It takes the following inputs:

*   The connected user’s ID

*   The call ID

*   The selector of the video tag to display the connected user’s local video

*   The ID of the tag where the remote videos will be added

Feel free to refer to the tutorial for more detailed examples and use cases
