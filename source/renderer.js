'use strict';
const electron = require('electron');
const {serializeError, deserializeError} = require('serialize-error');
const util = require('./util');

const {ipcRenderer} = electron;
const ipc = Object.create(ipcRenderer || {});

ipc.callMain = (channel, ...args) => new Promise((resolve, reject) => {
	const {sendChannel, dataChannel, errorChannel} = util.getResponseChannels(channel);

	const cleanup = () => {
		ipc.off(dataChannel, onData);
		ipc.off(errorChannel, onError);
	};

	const onData = (event, result) => {
		cleanup();
		resolve(result);
	};

	const onError = (event, error) => {
		cleanup();
		reject(error);
	};

	ipc.once(dataChannel, (event, result) => {
		onData(event, result);
	});

	ipc.once(errorChannel, (event, error) => {
		onError(event, deserializeError(error));
	});

	const completeData = {
		dataChannel,
		errorChannel,
		userArgs: args
	};

	ipc.send(sendChannel, completeData);
});

ipc.answerMain = (channel, callback) => {
	const browserWindow = electron.remote.getCurrentWindow();
	const sendChannel = util.getRendererSendChannel(browserWindow.id, channel);

	const listener = async (event, data) => {
		const {dataChannel, errorChannel, userArgs} = data;

		try {
			ipc.send(dataChannel, await callback(...userArgs));
		} catch (error) {
			ipc.send(errorChannel, serializeError(error));
		}
	};

	ipc.on(sendChannel, listener);

	return () => {
		ipc.off(sendChannel, listener);
	};
};

ipc.callRenderer = (browserWindow, channel, ...args) => new Promise((resolve, reject) => {
	const {sendChannel, dataChannel, errorChannel} = util.getRendererResponseChannels(browserWindow.id, channel);

	const cleanup = () => {
		ipc.off(dataChannel, onData);
		ipc.off(errorChannel, onError);
	};

	const onData = (event, result) => {
		cleanup();
		resolve(result);
	};

	const onError = (event, error) => {
		cleanup();
		reject(error);
	};

	ipc.once(dataChannel, (event, result) => {
		onData(event, result);
	});

	ipc.once(errorChannel, (event, error) => {
		onError(event, deserializeError(error));
	});

	const completeData = {
		dataChannel,
		errorChannel,
		userArgs: args
	};

	ipcRenderer.sendTo(browserWindow.webContents.id, sendChannel, completeData);
});

ipc.answerRenderer = (channel, callback) => {
	const browserWindow = electron.remote.getCurrentWindow();
	const sendChannel = util.getRendererSendChannel(browserWindow.id, channel);

	const listener = async (event, data) => {
		const webContents = electron.remote.webContents.fromId(event.id);
		const browserWindow = electron.remote.BrowserWindow.fromWebContents(webContents);

		const send = (channel, data) => {
			if (!(browserWindow && browserWindow.isDestroyed())) {
				event.sender.sendTo(event.sender.id, channel, data);
			}
		};

		const {dataChannel, errorChannel, userArgs} = data;

		try {
			send(dataChannel, await callback(...userArgs));
		} catch (error) {
			send(errorChannel, serializeError(error));
		}
	};

	ipc.on(sendChannel, listener);

	return () => {
		ipc.off(sendChannel, listener);
	};
};

module.exports = ipc;
