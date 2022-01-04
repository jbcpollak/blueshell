import 'mocha';
import * as sinon from 'sinon';
import {assert} from 'chai';
import {APIFunctionNotFound, DuplicateNodeAdded, NodeManager, INodeManager} from '../../lib/utils/nodeManager';
import {RuntimeWrappers, Utils} from '../../lib/utils/nodeManagerHelper';
import {BlueshellState} from '../../lib/models';
import {Action, Sequence} from '../../lib/nodes';
import {Session} from 'inspector';
import WebSocket from 'ws';
import {EventEmitter} from 'events';

class WebSocketServerMock extends EventEmitter {
	close() {}
}

class WebSocketClientMock extends EventEmitter {
	send(data: string) {
		this.emit('messageHandled');
	}
}

describe('nodeManager', function() {
	let nodeManager: INodeManager<BlueshellState, null>;

	beforeEach(function() {
		// reset the singleton
		NodeManager['instance'] = null;
		nodeManager = NodeManager.getInstance();
	});

	afterEach(function() {
		sinon.restore();
	});

	describe('reset the singleton', function() {
		it('should find node', function() {
			const testNode = new Action<BlueshellState, null>('testNode');
			nodeManager.addNode(testNode);
			const node = nodeManager.getNode('testNode');
			assert.equal(node, testNode);
		});

		it('should not find node', function() {
			const node = nodeManager.getNode('testNode');
			assert.isUndefined(node);
		});
	});

	describe('add/get/remove node', function() {
		it('should handle a node at the root', function() {
			const rootNode = new Action<BlueshellState, null>('testNode');

			nodeManager.addNode(rootNode);
			assert.equal(nodeManager.getNode('testNode'), rootNode);

			nodeManager.removeNode(rootNode);
			assert.isUndefined(nodeManager.getNode('testNode'));
		});

		it('should handle a node with a deep path', function() {
			const childNode = new Action<BlueshellState, null>('childTestNode');
			new Sequence<BlueshellState, null>('rootTestNode', [childNode]);

			nodeManager.addNode(childNode);
			assert.equal(nodeManager.getNode('rootTestNode_childTestNode'), childNode);

			assert.isUndefined(nodeManager.getNode('rootTestNode'));

			nodeManager.removeNode(childNode);
			assert.isUndefined(nodeManager.getNode('rootTestNode_childTestNode'));
		});

		it('should throw if duplicate node added', function() {
			const rootNode = new Action<BlueshellState, null>('testNode');

			nodeManager.addNode(rootNode);
			assert.equal(nodeManager.getNode('testNode'), rootNode);

			try {
				nodeManager.addNode(rootNode);
				assert(false, 'addNode should throw when adding duplicate node');
			} catch (err) {
				assert.instanceOf(err, DuplicateNodeAdded);
			}

			nodeManager.removeNode(rootNode);
			assert.isUndefined(nodeManager.getNode('testNode'));
		});

		it('should implicitly add and remove all children nodes', function() {
			const childNode = new Action<BlueshellState, null>('childTestNode');
			const rootNode = new Sequence<BlueshellState, null>('rootTestNode', [childNode]);

			nodeManager.addNode(rootNode);
			assert.equal(nodeManager.getNode('rootTestNode'), rootNode);
			assert.equal(nodeManager.getNode('rootTestNode_childTestNode'), childNode);

			nodeManager.removeNode(rootNode);
			assert.isUndefined(nodeManager.getNode('rootTestNode'));
			assert.isUndefined(nodeManager.getNode('rootTestNode_childTestNode'));
		});
	});

	describe('websocket api', function() {
		let session: Session;
		let serverStub: sinon.SinonStub;
		let serverMock: WebSocketServerMock;
		let clientMock: WebSocketClientMock;
		let serverCloseStub: sinon.SinonStub;
		let clientSendSpy: sinon.SinonSpy;
		let removeBreakpointHelperStub: sinon.SinonStub;
		let setBreakpointHelperStub: sinon.SinonStub;

		beforeEach(function() {
			serverMock = new WebSocketServerMock();
			clientMock = new WebSocketClientMock();
			serverStub = sinon.stub(WebSocket, 'Server').returns(serverMock);
			serverCloseStub = sinon.stub(serverMock, 'close');
			clientSendSpy = sinon.spy(clientMock, 'send');
			removeBreakpointHelperStub = sinon.stub(RuntimeWrappers, 'removeBreakpointFromFunction').callThrough();
			setBreakpointHelperStub = sinon.stub(RuntimeWrappers, 'setBreakpointOnFunctionCall').callThrough();
			session = (<NodeManager<BlueshellState, null>>nodeManager)['session'];

			nodeManager.runServer();
			sinon.assert.calledWith(serverStub, {
				host: 'localhost',
				port: 8990,
			});
			serverMock.emit('connection', clientMock);

			// stub all the session post calls so we don't actually set breakpoints
			// sinon.stub(session, <any>'post').callThrough()
			// .withArgs(
			// 	'Debugger.enable',
			// 	sinon.match.func)
			// .callsFake((callback: () => void
			// ) => {
			// 	callback();
			// });
		});

		afterEach(function() {
			session.disconnect();
			sinon.reset();
		});

		describe('getMethodsForNode', function() {
			it('should get all methods and properties for a node', async function() {
				const rootNode = new Action<BlueshellState, null>('testNode');
				nodeManager.addNode(rootNode);

				clientMock.emit('message', JSON.stringify({
					request: 'getMethodsForNode',
					nodePath: 'testNode',
				}));
				sinon.assert.calledWith(clientSendSpy, JSON.stringify({
					request: 'getMethodsForNode',
					success: true,
					nodePath: 'testNode',
					listOfMethods: Utils.getMethodInfoForObject(rootNode),
					nodeName: 'testNode',
					nodeParent: '',
				}));
			});

			it('should get all methods and properties for a child node', async function() {
				const childNode = new Action<BlueshellState, null>('childTestNode');
				const rootNode = new Sequence<BlueshellState, null>('rootTestNode', [childNode]);
				nodeManager.addNode(rootNode);

				clientMock.emit('message', JSON.stringify({
					request: 'getMethodsForNode',
					nodePath: 'rootTestNode_childTestNode',
				}));
				sinon.assert.calledWith(clientSendSpy, JSON.stringify({
					request: 'getMethodsForNode',
					success: true,
					nodePath: 'rootTestNode_childTestNode',
					listOfMethods: Utils.getMethodInfoForObject(childNode),
					nodeName: 'childTestNode',
					nodeParent: 'rootTestNode',
				}));
			});

			it('should not return success if node not found', async function() {
				clientMock.emit('message', JSON.stringify({
					request: 'getMethodsForNode',
					nodePath: 'testNode',
				}));

				sinon.assert.calledWith(clientSendSpy, JSON.stringify({
					request: 'getMethodsForNode',
					success: false,
					nodePath: 'testNode',
				}));
			});
		});

		describe('placeBreakpoint', function() {
			let childNode: Action<BlueshellState, null>;
			let rootNode: Sequence<BlueshellState, null>;
			const rootNodeName = 'rootTestNode';
			const childNodeName = 'childTestNode';
			const childNodePath = `${rootNodeName}_${childNodeName}`;
			const condition = 'this.name === \'foo\'';

			beforeEach(function() {
				childNode = new Action<BlueshellState, null>(childNodeName);
				rootNode = new Sequence<BlueshellState, null>(rootNodeName, [childNode]);
				nodeManager.addNode(rootNode);
			});

			it('should place a breakpoint with no additional condition', async function() {
				clientMock.emit('message', JSON.stringify({
					request: 'placeBreakpoint',
					nodePath: childNodePath,
					methodName: 'handleEvent',
					condition: '',
				}));
				// this is required to get over the promises that happen in the async callback when we emit message above
				await EventEmitter.once(clientMock, 'messageHandled');
				sinon.assert.notCalled(removeBreakpointHelperStub);
				const bps = new Map();
				bps.set(childNodePath, {
					nodePath: childNodePath,
					condition: '',
					nodeName: childNodeName,
					nodeParent: rootNodeName,
				});
				sinon.assert.calledWith(setBreakpointHelperStub,
					sinon.match.object,
					sinon.match.string,
					`(this.path === '${childNodePath}')`,
					{
						methodInfo: {
							className: 'Base',
							methodName: 'handleEvent',
						},
						breakpointId: sinon.match.string,
						breakpoints: bps,
					}
				);
				sinon.assert.calledWith(clientSendSpy, JSON.stringify({
					request: 'placeBreakpoint',
					nodePath: childNodePath,
					methodName: 'handleEvent',
					nodeName: childNodeName,
					nodeParent: rootNodeName,
					condition: '',
					success: true,
				}));
			});

			it('should place a breakpoint with an additional condition', async function() {
				const condition = 'this.name === \'foo\'';
				clientMock.emit('message', JSON.stringify({
					request: 'placeBreakpoint',
					nodePath: childNodePath,
					methodName: 'handleEvent',
					condition,
				}));
				// this is required to get over the promises that happen in the async callback when we emit message above
				await EventEmitter.once(clientMock, 'messageHandled');
				sinon.assert.notCalled(removeBreakpointHelperStub);
				const bps = new Map();
				bps.set(childNodePath, {
					nodePath: childNodePath,
					condition,
					nodeName: childNodeName,
					nodeParent: rootNodeName,
				});
				sinon.assert.calledWith(setBreakpointHelperStub,
					sinon.match.object,
					sinon.match.string,
					`(this.path === '${childNodePath}' && ${condition})`,
					{
						methodInfo: {
							className: 'Base',
							methodName: 'handleEvent',
						},
						breakpointId: sinon.match.string,
						breakpoints: bps,
					}
				);
				sinon.assert.calledWith(clientSendSpy, JSON.stringify({
					request: 'placeBreakpoint',
					nodePath: childNodePath,
					methodName: 'handleEvent',
					nodeName: childNodeName,
					nodeParent: rootNodeName,
					condition,
					success: true,
				}));
			});

			it('should place a breakpoint on a getter');	// @@@ I don't think this works yet - always would set it on getter
			it('should place a breakpoint on a setter');	// @@@ I don't think this works yet - always would set it on getter
			it('should place a 2nd breakpoint on the same function of another instance (same class)', async function() {
				clientMock.emit('message', JSON.stringify({
					request: 'placeBreakpoint',
					nodePath: childNodePath,
					methodName: 'handleEvent',
					condition: '',
				}));
				// this is required to get over the promises that happen in the async callback when we emit message above
				await EventEmitter.once(clientMock, 'messageHandled');
				removeBreakpointHelperStub.resetHistory();
				setBreakpointHelperStub.resetHistory();
				clientSendSpy.resetHistory();

				const condition = 'this.name === \'foo\'';
				clientMock.emit('message', JSON.stringify({
					request: 'placeBreakpoint',
					nodePath: rootNodeName,
					methodName: 'handleEvent',
					condition,
				}));
				// this is required to get over the promises that happen in the async callback when we emit message above
				await EventEmitter.once(clientMock, 'messageHandled');

				sinon.assert.called(removeBreakpointHelperStub);
				const bps = new Map();
				bps.set(childNodePath, {
					nodePath: childNodePath,
					condition: '',
					nodeName: childNodeName,
					nodeParent: rootNodeName,
				});
				bps.set(rootNodeName, {
					nodePath: rootNodeName,
					condition,
					nodeName: rootNodeName,
					nodeParent: '',
				});
				sinon.assert.calledWith(setBreakpointHelperStub,
					sinon.match.object,
					sinon.match.string,
					`(this.path === '${childNodePath}') || (this.path === '${rootNodeName}' && ${condition})`,
					{
						methodInfo: {
							className: 'Base',
							methodName: 'handleEvent',
						},
						breakpointId: sinon.match.string,
						breakpoints: bps,
					}
				);
				sinon.assert.calledWith(clientSendSpy, JSON.stringify({
					request: 'placeBreakpoint',
					nodePath: rootNodeName,
					methodName: 'handleEvent',
					nodeName: rootNodeName,
					nodeParent: '',
					condition,
					success: true,
				}));
			});
			it('should place a 2nd breakpoint on the same function of another instance (different class)');
			it('should update the condition on an existing breakpoint');

			describe('placeBreakpoint error cases', function() {
				it('should fail to place a breakpoint for node that does not exist');
				it('should fail to place a breakpoint for a method that does not exist on the node');
				it('should fail to place the same breakpoint a second time with no condition');
				it('should fail to place the same breakpoint a second time with the same condition');
			});
		});

		describe('removeBreakpoint', function() {
			it('should remove a breakpoint when only one is set on the class/method');
			it('should remove a breakpoint for the specified node when more than one is set on the class/method');
			describe('removeBreakpoint error cases', function() {
				it('should fail to remove a breakpoint on a node that does not exist');
				it('should fail to remove a breakpoint on a method that does not exist on the node');
			});
		});

		describe('client reconnect', function() {
			it('should send any existing breakpoints back to the client when the client reconnects');
		});

		describe('unknown request', function() {
			it('should report error if api function does not exist', async function() {
				clientMock.emit('message', JSON.stringify({
					request: 'foobar',
				}));

				sinon.assert.calledWith(clientSendSpy, JSON.stringify({
					request: 'foobar',
					success: false,
					err: new APIFunctionNotFound('foobar').message,
				}));
			});
		});
	});
});
