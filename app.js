// Import Firebase SDK v12 modules
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js';
import { 
    getAuth, 
    GoogleAuthProvider, 
    signInWithPopup, 
    signOut, 
    onAuthStateChanged 
} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js';
import { 
    getDatabase, 
    ref, 
    push, 
    set, 
    onValue, 
    off, 
    remove,
    serverTimestamp,
    onDisconnect
} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js';
import { 
    getStorage, 
    ref as storageRef, 
    uploadBytes, 
    getDownloadURL 
} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-storage.js';

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBBY8_NwdMSbt-0RLT3y8S4B0QRaB7i808",
    authDomain: "weffriend.firebaseapp.com",
    databaseURL: "https://weffriend-default-rtdb.firebaseio.com",
    projectId: "weffriend",
    storageBucket: "weffriend.firebasestorage.app",
    messagingSenderId: "143920532023",
    appId: "1:143920532023:web:2cedd49311829916094db2",
    measurementId: "G-W9JMB92BJJ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);
const storage = getStorage(app);

// Global variables
let currentUser = null;
let currentUsername = null;
let messagesListener = null;
let onlineUsersListener = null;

// DOM elements
const loginScreen = document.getElementById('loginScreen');
const usernameScreen = document.getElementById('usernameScreen');
const chatScreen = document.getElementById('chatScreen');
const loadingOverlay = document.getElementById('loadingOverlay');

const googleSignInBtn = document.getElementById('googleSignInBtn');
const usernameInput = document.getElementById('usernameInput');
const setUsernameBtn = document.getElementById('setUsernameBtn');
const logoutBtn = document.getElementById('logoutBtn');

const currentUserName = document.getElementById('currentUserName');
const onlineStatus = document.getElementById('onlineStatus');
const onlineCount = document.getElementById('onlineCount');
const onlineUsersList = document.getElementById('onlineUsersList');
const messagesContainer = document.getElementById('messagesContainer');

const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const fileBtn = document.getElementById('fileBtn');
const fileInput = document.getElementById('fileInput');

// Utility functions
function showLoading() {
    loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
    loadingOverlay.classList.add('hidden');
}

function showScreen(screen) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    screen.classList.remove('hidden');
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function isImageFile(filename) {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    return imageExtensions.some(ext => filename.toLowerCase().endsWith(ext));
}

function getFileIcon(filename) {
    const extension = filename.toLowerCase().split('.').pop();
    const icons = {
        'pdf': '📄',
        'doc': '📝',
        'docx': '📝',
        'txt': '📄',
        'mp4': '🎥',
        'avi': '🎥',
        'mov': '🎥',
        'mp3': '🎵',
        'wav': '🎵',
        'zip': '📦',
        'rar': '📦'
    };
    return icons[extension] || '📎';
}

// Authentication functions
async function signInWithGoogle() {
    try {
        showLoading();
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        console.log('User signed in:', result.user);
    } catch (error) {
        console.error('Error signing in:', error);
        alert('Failed to sign in. Please try again.');
    } finally {
        hideLoading();
    }
}

async function handleSignOut() {
    try {
        showLoading();
        
        // Remove user from online users
        if (currentUser) {
            await remove(ref(database, `onlineUsers/${currentUser.uid}`));
        }
        
        // Clean up listeners
        if (messagesListener) {
            off(messagesListener);
        }
        if (onlineUsersListener) {
            off(onlineUsersListener);
        }
        
        await signOut(auth);
        
        // Reset global variables
        currentUser = null;
        currentUsername = null;
        messagesListener = null;
        onlineUsersListener = null;
        
        showScreen(loginScreen);
    } catch (error) {
        console.error('Error signing out:', error);
        alert('Failed to sign out. Please try again.');
    } finally {
        hideLoading();
    }
}

// Username functions
async function setUsername() {
    const username = usernameInput.value.trim();
    
    if (!username) {
        alert('Please enter a username');
        return;
    }
    
    if (username.length > 20) {
        alert('Username must be 20 characters or less');
        return;
    }
    
    try {
        showLoading();
        
        // Save username to user profile
        await set(ref(database, `users/${currentUser.uid}`), {
            username: username,
            email: currentUser.email,
            photoURL: currentUser.photoURL,
            lastSeen: serverTimestamp()
        });
        
        currentUsername = username;
        currentUserName.textContent = username;
        
        // Add user to online users
        await setUserOnline();
        
        showScreen(chatScreen);
        setupChatListeners();
        
    } catch (error) {
        console.error('Error setting username:', error);
        alert('Failed to set username. Please try again.');
    } finally {
        hideLoading();
    }
}

// Online status functions
async function setUserOnline() {
    if (!currentUser || !currentUsername) return;
    
    const userOnlineRef = ref(database, `onlineUsers/${currentUser.uid}`);
    
    await set(userOnlineRef, {
        username: currentUsername,
        photoURL: currentUser.photoURL,
        timestamp: serverTimestamp()
    });
    
    // Remove user when they disconnect
    onDisconnect(userOnlineRef).remove();
}

function setupOnlineUsersListener() {
    const onlineUsersRef = ref(database, 'onlineUsers');
    
    onlineUsersListener = onValue(onlineUsersRef, (snapshot) => {
        const users = snapshot.val() || {};
        const userCount = Object.keys(users).length;
        
        onlineCount.textContent = userCount;
        
        // Display online users
        onlineUsersList.innerHTML = '';
        Object.values(users).forEach(user => {
            const userElement = document.createElement('div');
            userElement.className = 'online-user';
            userElement.textContent = user.username;
            onlineUsersList.appendChild(userElement);
        });
    });
}

// Message functions
async function sendMessage() {
    const messageText = messageInput.value.trim();
    
    if (!messageText || !currentUser || !currentUsername) return;
    
    try {
        const messagesRef = ref(database, 'messages');
        await push(messagesRef, {
            text: messageText,
            username: currentUsername,
            userId: currentUser.uid,
            userPhoto: currentUser.photoURL,
            timestamp: serverTimestamp()
        });
        
        messageInput.value = '';
        
    } catch (error) {
        console.error('Error sending message:', error);
        alert('Failed to send message. Please try again.');
    }
}

async function uploadFile(file) {
    if (!file || !currentUser || !currentUsername) return;
    
    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
        alert('File size must be less than 10MB');
        return;
    }
    
    try {
        showLoading();
        
        // Create unique filename
        const timestamp = Date.now();
        const filename = `${timestamp}_${file.name}`;
        const fileRef = storageRef(storage, `chat-files/${filename}`);
        
        // Upload file
        const snapshot = await uploadBytes(fileRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);
        
        // Send message with file
        const messagesRef = ref(database, 'messages');
        await push(messagesRef, {
            text: `Shared a file: ${file.name}`,
            username: currentUsername,
            userId: currentUser.uid,
            userPhoto: currentUser.photoURL,
            timestamp: serverTimestamp(),
            file: {
                name: file.name,
                url: downloadURL,
                type: file.type,
                size: file.size
            }
        });
        
    } catch (error) {
        console.error('Error uploading file:', error);
        alert('Failed to upload file. Please try again.');
    } finally {
        hideLoading();
    }
}

async function deleteMessage(messageId) {
    if (!currentUser) return;
    
    try {
        await remove(ref(database, `messages/${messageId}`));
    } catch (error) {
        console.error('Error deleting message:', error);
        alert('Failed to delete message. Please try again.');
    }
}

function displayMessage(messageId, messageData) {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${messageData.userId === currentUser.uid ? 'own' : ''}`;
    messageElement.dataset.messageId = messageId;
    
    const messageHeader = document.createElement('div');
    messageHeader.className = 'message-header';
    
    const username = document.createElement('span');
    username.className = 'message-username';
    username.textContent = messageData.username;
    
    const time = document.createElement('span');
    time.className = 'message-time';
    time.textContent = formatTime(messageData.timestamp);
    
    messageHeader.appendChild(username);
    messageHeader.appendChild(time);
    
    // Add delete button for own messages
    if (messageData.userId === currentUser.uid) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = '🗑️';
        deleteBtn.onclick = () => {
            if (confirm('Delete this message?')) {
                deleteMessage(messageId);
            }
        };
        messageHeader.appendChild(deleteBtn);
    }
    
    const messageBubble = document.createElement('div');
    messageBubble.className = 'message-bubble';
    
    const messageText = document.createElement('div');
    messageText.textContent = messageData.text;
    messageBubble.appendChild(messageText);
    
    // Handle file attachments
    if (messageData.file) {
        const fileElement = document.createElement('div');
        fileElement.className = 'message-file';
        
        if (isImageFile(messageData.file.name)) {
            const img = document.createElement('img');
            img.src = messageData.file.url;
            img.className = 'file-preview';
            img.onclick = () => window.open(messageData.file.url, '_blank');
            fileElement.appendChild(img);
        } else {
            const fileLink = document.createElement('a');
            fileLink.href = messageData.file.url;
            fileLink.target = '_blank';
            fileLink.className = 'file-link';
            fileLink.innerHTML = `
                <span>${getFileIcon(messageData.file.name)}</span>
                <span>${messageData.file.name}</span>
                <span>(${(messageData.file.size / 1024).toFixed(1)} KB)</span>
            `;
            fileElement.appendChild(fileLink);
        }
        
        messageBubble.appendChild(fileElement);
    }
    
    messageElement.appendChild(messageHeader);
    messageElement.appendChild(messageBubble);
    
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function setupChatListeners() {
    // Messages listener
    const messagesRef = ref(database, 'messages');
    messagesListener = onValue(messagesRef, (snapshot) => {
        messagesContainer.innerHTML = '';
        
        const messages = snapshot.val() || {};
        
        // Sort messages by timestamp
        const sortedMessages = Object.entries(messages).sort((a, b) => {
            return (a[1].timestamp || 0) - (b[1].timestamp || 0);
        });
        
        sortedMessages.forEach(([messageId, messageData]) => {
            displayMessage(messageId, messageData);
        });
    });
    
    // Online users listener
    setupOnlineUsersListener();
}

// Event listeners
googleSignInBtn.addEventListener('click', signInWithGoogle);
setUsernameBtn.addEventListener('click', setUsername);
logoutBtn.addEventListener('click', handleSignOut);

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

fileBtn.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        uploadFile(file);
    }
    e.target.value = ''; // Reset file input
});

usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        setUsername();
    }
});

// Authentication state observer
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        
        // Check if user has a username
        const userRef = ref(database, `users/${user.uid}`);
        onValue(userRef, (snapshot) => {
            const userData = snapshot.val();
            
            if (userData && userData.username) {
                currentUsername = userData.username;
                currentUserName.textContent = userData.username;
                setUserOnline();
                showScreen(chatScreen);
                setupChatListeners();
            } else {
                showScreen(usernameScreen);
            }
        }, { onlyOnce: true });
        
    } else {
        currentUser = null;
        currentUsername = null;
        
        // Clean up listeners
        if (messagesListener) {
            off(messagesListener);
            messagesListener = null;
        }
        if (onlineUsersListener) {
            off(onlineUsersListener);
            onlineUsersListener = null;
        }
        
        showScreen(loginScreen);
    }
});

// Initialize app
console.log('WeFriend Chat initialized');
