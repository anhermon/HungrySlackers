(function () {
    'use strict';
    /*global $, chrome, console, Json*/

    String.prototype.contains = function (x) {
        return this.indexOf(x) > -1;
    };
    var server, openUrl, joinUrl, closeUrl, cancelUrl, tenBisDishesIndexUrl, orderConfirmationUrl,
        addDishAjaxUrl;

    server = 'http://172.16.50.88:9000/HungrySlackers';
    openUrl = '/invite';
    joinUrl = '/join';
    closeUrl = '/finalize';
    cancelUrl = '/cancel';


    tenBisDishesIndexUrl = 'https://www.10bis.co.il/ShoppingCart/DishesIndex';
    orderConfirmationUrl = 'https://www.10bis.co.il/OrderConfirmation';
    addDishAjaxUrl = 'https://www.10bis.co.il/ShoppingCart/AddDishAjax';

    function doRefresh() {
        chrome.tabs.getSelected(null, function (tab) {
            var code = 'window.location.reload();';
            chrome.tabs.executeScript(tab.id, {
                code: code
            });
        });
    }

    function sendNotification(title, message) {
        var options = {
            type: "basic",
            title: title,
            message: message,
            iconUrl: "img/icon48.png"
        };

        chrome.runtime.sendMessage({
            from: 'cyber bis',
            body: options
        });
    }

    /**
     * Get the current URL.
     *
     * @param {function(string)} callback - called when the URL of the current tab
     *   is found.
     */
    function getCurrentTabUrl(callback) {
        // Query filter to be passed to chrome.tabs.query - see
        // https://developer.chrome.com/extensions/tabs#method-query
        var queryInfo = {
            active: true,
            currentWindow: true
        };

        chrome.tabs.query(queryInfo, function (tabs) {
            var tab, url;
            // chrome.tabs.query invokes the callback with a list of tabs that match the
            // query. When the popup is opened, there is certainly a window and at least
            // one tab, so we can safely assume that |tabs| is a non-empty array.
            // A window can only have one active tab at a time, so the array consists of
            // exactly one tab.
            tab = tabs[0];

            // A tab is a plain object that provides information about the tab.
            // See https://developer.chrome.com/extensions/tabs#type-Tab
            url = tab.url;

            // tab.url is only available if the "activeTab" permission is declared.
            // If you want to see the URL of other tabs (e.g. after removing active:true
            // from |queryInfo|), then the "tabs" permission is required to see their
            // "url" properties.
            console.assert(typeof url === 'string', 'tab.url should be a string');

            callback(url);
        });

        // Most methods of the Chrome extension APIs are asynchronous. This means that
        // you CANNOT do something like this:
        //
        // var url;
        // chrome.tabs.query(queryInfo, function(tabs) {
        //   url = tabs[0].url;
        // });
        // alert(url); // Shows "undefined", because chrome.tabs.query is async.
    }

    /**
     * @param {string} searchTerm - Search term for Google Image search.
     * @param {function(string,number,number)} callback - Called when an image has
     *   been found. The callback gets the URL, width and height of the image.
     * @param {function(string)} errorCallback - Called when the image is not found.
     *   The callback gets a string that describes the failure reason.
     */
    function sendToServer(url, dataToSend, callback, errorCallback) {
        $.ajax({
            url: url,
            type: "POST",
            contentType: "application/json",
            data: JSON.stringify(dataToSend),
            timeout: 2000
        }).done(callback).fail(errorCallback);

        //$.post(url, dataToSend, callback)
        //.fail(errorCallback);
    }

    function renderStatus(statusText) {
        console.log(statusText);
        document.getElementById('status').textContent = statusText;
    }

    function onMenuBtnClick() {
        console.log('clicked');
        getCurrentTabUrl(function (url) {
            //TODO
            renderStatus('Open new order with: ' + url);
        });
    }

    function addCommonData(data, res) {
        data.UserId = res.UserId;
        data.RestaurantId = res.Restaurant.RestaurantId;
        data.RestaurantName = res.Restaurant.RestaurantName;
    }

    function get10BisData(cb) {
        $.get(tenBisDishesIndexUrl, cb);
    }

    function getOrderConfirmation(cb) {
        $.get(orderConfirmationUrl, cb);
    }

    function addDish(dish, cb, onError) {
        var dishToSubmit = {};
        dishToSubmit.AssignedUserId = dish.DishUserId;
        dishToSubmit.ID = dish.ID;
        dishToSubmit.DishOwnerId = dish.DishOwnerId;
        dishToSubmit.Quantity = dish.Quantity;
        dishToSubmit.DishNotes = dish.DishNotes;

        dishToSubmit = JSON.stringify({
            dishToSubmit: dishToSubmit
        });
        $.ajax({
            url: addDishAjaxUrl,
            type: "POST",
            contentType: "application/json",
            data: dishToSubmit
        }).done(cb).fail(onError);
    }

    function addAllDishes(dishes, cb, onError, onFinishedAll) {
        console.log(dishes);
        var requests = [];
        $.each(dishes, function (index, dish) {
            requests.push(addDish(dish, cb, onError));
        });
        $.when(requests).done(onFinishedAll);
    }



    function baseAction(cb) {
        getCurrentTabUrl(function (url) {
            if (!url.contains('www.10bis.co.il')) {
                sendNotification('Warning', 'You need to browse 10bis do this.');
                return;
            }
            cb(url);
        });
    }

    function openNewOrder() {
        baseAction(function (url) {
            get10BisData(function (res) {
                getOrderConfirmation(function (orderConfirmationData) {
                    var data = {
                        url: url
                    };
                    addCommonData(data, res);
                    try {
                        data.UserName = orderConfirmationData.DishList[0].DishUserName;
                    } catch (e) {}
                    if (!data.UserName) {
                        data.UserName = 'John doe';
                    }
                    sendToServer(server + openUrl, data, function (responseData) {
                        sendNotification('Success', 'Your order opened successfully.');
                    }, function (errorMessage) {
                        sendNotification('Failure', 'Failed to open new order.' + errorMessage.responseText);
                    });
                });
            });
        });
    }

    function join() {
        baseAction(function (url) {
            get10BisData(function (tenBisData) {
                getOrderConfirmation(function (orderConfirmationData) {
                    var data = {
                        DishList: orderConfirmationData.DishList
                    };

                    addCommonData(data, tenBisData);
                    sendToServer(server + joinUrl, data, function (responseData, status) {
                        sendNotification('Success', 'You joined an order succesfully.');
                    }, function (errorMessage, status) {
                        sendNotification('Failure', 'Join order failed, error:' + errorMessage.responseText);
                    });
                });
            });
        });
    }

    function close() {
        baseAction(function (url) {
            get10BisData(function (res) {
                var data = {};
                addCommonData(data, res);
                sendToServer(server + closeUrl, data, function (dishesRes) {
                    addAllDishes(dishesRes.DishList,
                        function (data) {
                            console.log(data);
                            if (data === false) {
                                sendNotification('Success', 'Order was finalized succesfully.');

                            }
                        },
                        function (errorMessage) {
                            sendNotification('Failed', 'Order finalization failed.' + errorMessage.responseText);
                        }, doRefresh);
                }, function (errorMessage) {
                    sendNotification('Failed', 'Order finalization failed.' + errorMessage.responseText);
                });
            });
        });
    }

    function cancel() {
        baseAction(function () {
            get10BisData(function (res) {
                var data = {};
                addCommonData(data, res);
                sendToServer(server + cancelUrl, data, function (response) {
                    renderStatus('Order canceled');
                });

            });
        });
    }

    document.addEventListener('DOMContentLoaded', function () {

        document.getElementById("open-btn").addEventListener("click", function () {
            openNewOrder();
        });
        document.getElementById("join-btn").addEventListener("click", function () {
            join();
        });
        document.getElementById("close-btn").addEventListener("click", function () {
            close();
        });
        document.getElementById("cancel-btn").addEventListener("click", function () {
            cancel();
        });

    });
}());
