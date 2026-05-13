import { io } from 'socket.io-client';
import { API_URL } from './api';

const URL = API_URL;
export const socket = io(URL, {
    autoConnect: true
});
