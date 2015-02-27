(function () {
    "use strict";

    var nodeRegistry = [];

    var bgPageConnection = chrome.runtime.connect({
        name: "content-script"
    });

    bgPageConnection.postMessage({
        type: 'connected'
    });

    function highlightNode(node) {
        if (node && node.nodeName === '#text') {
            highlightNode(node.parentNode);
        } else if (node && node.style) {
            var boxShadowOrg = node.style.boxShadow;

            var player = node.animate([
                {boxShadow: '0 0 0 5px rgba(51, 195, 240, 1)'},
                {boxShadow: '0 0 0 5px rgba(51, 195, 240, 0)'}
            ], 600);

            player.onfinish = function () {
                node.style.boxShadow = boxShadowOrg;
            };
        }
    }

    function nodeToSelector(node, contextNode) {
        if (node.id) {
            return '#' + node.id;
        } else if (node.classList && node.classList.length) {
            return node.tagName + '.' + Array.prototype.join.call(node.classList, '.');
        } else if (node.parentElement && node.parentElement !== contextNode) {
            var parentSelector = nodeToSelector(node.parentElement, contextNode);

            if (node.nodeName === '#comment') {
                return parentSelector + ' > (comment)';
            } else if (node.nodeName === '#text') {
                return parentSelector + ' > (text)';
            } else {
                return parentSelector + ' > ' + node.nodeName;
            }
        } else if (node.nodeName) {
            if (node.nodeName === '#comment') {
                return '(comment)';
            } else if (node.nodeName === '#text') {
                return '(text)';
            } else {
                return node.nodeName;
            }
        } else {
            return '(unknown)';
        }
    }

    function nodesToObjects(nodes, contextNode) {
        return Array.prototype.map.call(nodes, function (node) {
            return nodeToObject(node, contextNode);
        });
    }

    function nodeToObject(node, contextNode) {
        var nodeId = nodeRegistry.indexOf(node);

        if(nodeId === -1) {
            nodeRegistry.push(node);
            nodeId = nodeRegistry.length - 1;
        }

        highlightNode(node);

        return {
            selector: nodeToSelector(node, contextNode),
            nodeId: nodeId
        };
    }

    function logEvent(event) {
        bgPageConnection.postMessage({
            type: 'event',
            event: event
        });
    }

    function cleanUpNodeRegistry() {
        //get rid of detached nodes
        for (var i = 0, l = nodeRegistry.length; i < l; i++) {
            var node = nodeRegistry[i];

            if (node && !document.contains(node)) {
                nodeRegistry[i] = null;
            }
        }
    }

    function onMutation(records) {
        var record, i, l;

        for (i = 0, l = records.length; i < l; i++) {
            record = records[i];

            if (record.type === 'childList') {
                if (record.addedNodes.length) {
                    logEvent({
                        type: 'nodes added',
                        target: nodeToObject(record.target),
                        nodes: nodesToObjects(record.addedNodes, record.target)
                    });
                }

                if (record.removedNodes.length) {
                    logEvent({
                        type: 'nodes removed',
                        target: nodeToObject(record.target),
                        nodes: nodesToObjects(record.removedNodes, record.target)
                    });

                    cleanUpNodeRegistry();
                }
            } else if (record.type === 'attributes') {
                logEvent({
                    type: 'attribute changed',
                    target: nodeToObject(record.target),
                    attribute: record.attributeName,
                    oldValue: record.oldValue,
                    newValue: record.target.getAttribute(record.attributeName)
                });
            } else if (record.type === 'characterData') {
                logEvent({
                    type: 'text changed',
                    target: nodeToObject(record.target),
                    newValue: record.target.data,
                    oldValue: record.oldValue
                });
            } else {
                console.error('DOM Listener Extension: unknown type of event', record);
            }
        }
    }

    if (!window.domListenerExtension) {
        var MutationObserver = window.MutationObserver || window.WebKitMutationObserver;

        if (typeof MutationObserver !== 'function') {
            console.error('DOM Listener Extension: MutationObserver is not available in your browser.');
            return;
        }

        var observer = new MutationObserver(onMutation);

        window.domListenerExtension = {
            startListening: function () {
                observer.disconnect();
                observer.observe(document, {
                    subtree: true,
                    childList: true,
                    attributes: true,
                    attributeOldValue: true,
                    characterData: true,
                    characterDataOldValue: true
                });
            },
            stopListening: function () {
                observer.disconnect();
            },
            getNode: function (nodeId) {
                return nodeRegistry[nodeId];
            },
            highlightNode: function (nodeId) {
                var node = this.getNode(nodeId);
                highlightNode(node);
            }
        };
    }
})();
