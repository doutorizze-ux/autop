import { io } from 'socket.io-client';
import { API_URL } from './api';

const URL = API_URL;
export const socket = io(URL, {
    autoConnect: false
});

export const connectSocket = (token?: string | null) => {
    if (!token) return;

    socket.auth = { token };
    if (!socket.connected) {
        socket.connect();
    }
};

export const disconnectSocket = () => {
    if (socket.connected) {
        socket.disconnect();
    }
};
