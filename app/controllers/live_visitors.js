/**
 * Piwik - Open source web analytics
 *
 * @link http://piwik.org
 * @license http://www.gnu.org/licenses/gpl-3.0.html Gpl v3 or later
 */

function L(key)
{
    return require('L')(key);
}

var refreshIntervalInMs = 45000;
var refreshTimer = null;
$.emptyData = new (require('ui/emptydata'));

$.countdown.init(parseInt(refreshIntervalInMs / 1000, 10));

var piwikLiveVisitors = Alloy.createCollection('piwikLiveVisitors');

if (OS_IOS) {
    $.pullToRefresh.init($.liveTable);
}

function registerEvents()
{
    var session = require('session');
    session.on('websiteChanged', onWebsiteChanged);
}

function unregisterEvents()
{
    var session = require('session');
    session.off('websiteChanged', onWebsiteChanged);

    $.index.removeEventListener('focus', restartTimerIfSomeVisitorsAreAlreadyDisplayed);
    $.index.removeEventListener('open', onOpen);
    $.liveTable.removeEventListener('click', openVisitor);

    if (OS_ANDROID) {
        $.headerBar.off();
    }
}

function trackWindowRequest()
{
    require('Piwik/Tracker').trackWindow('Visitors in Real-time', 'visitors-in-real-time');
}

function onOpen()
{
    trackWindowRequest();
}

function onClose()
{
    $.emptyData && $.emptyData.cleanupIfNeeded();

    unregisterEvents();
    stopHandleBackgroundEvents();
    stopRefreshTimer();

    if (OS_ANDROID) {
        // this frees a lot of memory
        $.liveTable.setData([]);
    }

    $.countdown && $.countdown.stop();
    $.destroy();
    $.off();
}

function onWebsiteChanged()
{
    require('Piwik/Tracker').trackEvent({title: 'Website Changed', url: '/visitors-in-real-time/change/website'});

    doRefresh();
}

function stopRefreshTimer() {

    if (refreshTimer) {
        // do no longer execute autoRefresh if user opens another app or returns the home screen (only for iOS)
        clearTimeout(refreshTimer);
    }
    
    $.countdown.stop();
}

function startRefreshTimer (timeoutInMs) {
    stopRefreshTimer();

    $.countdown.init(parseInt(timeoutInMs / 1000, 10));
    $.countdown.start();

    refreshTimer = setTimeout(function () {
        if (doRefresh) {
            doRefresh();
        }
    }, timeoutInMs);
}

function openVisitor(event)
{
    if (!event || !event.row || !event.row.visitor) {
        return;
    }

    stopRefreshTimer();
    var params  = {visitor: event.row.visitor};
    var visitor = Alloy.createController('visitor', params);
    visitor.open();
}

function render(account, counter30Min, counter24Hours, visitorDetails)
{
    if (!visitorDetails || !visitorDetails.length) {
        showReportHasNoVisitors(L('Mobile_NoVisitorsShort'), L('Mobile_NoVisitorFound'));
        return;
    }

    showReportContent();

    var rows = [];

    counter30Min.title = String.format(L('Live_LastMinutes'), '30');
    var last30minutes = Alloy.createController('live_counter', counter30Min);
    rows.push(last30minutes.getView());
    last30minutes = null;

    counter24Hours.title = String.format(L('Live_LastHours'), '24');
    var last24hours = Alloy.createController('live_counter', counter24Hours);
    rows.push(last24hours.getView());
    last24hours = null;

    _.forEach(visitorDetails, function (visitorDetail) {
        var params = {account: account, visitor: visitorDetail};
        var visitorOverview = Alloy.createController('visitor_overview', params);
        var visitorRow      = visitorOverview.getView();
        visitorRow.visitor  = visitorDetail;
        rows.push(visitorRow);
        visitorRow = null;
        visitorOverview = null;
    });

    $.liveTable.setData(rows);
    rows = null;
    account = null;
    visitorDetails = null;
    counter30Min   = null;
    counter24Hours = null;

    startRefreshTimer(refreshIntervalInMs);
}

function showReportContent()
{
    if (OS_IOS) {
        $.pullToRefresh.refreshDone();
    } 

    $.content.show();
    $.loadingindicator.hide();
    $.emptyData.cleanupIfNeeded();
}

function showReportHasNoVisitors(title, message)
{
    $.emptyData.show($.index, doRefresh, title, message);

    $.content.hide();
    $.loadingindicator.hide();
}

function showLoadingMessage()
{
    if (OS_IOS) {
        $.pullToRefresh.refresh();
    } 

    $.loadingindicator.show();
    $.content.hide();
    $.emptyData.cleanupIfNeeded();
    stopRefreshTimer();
}

function onFetchError(undefined, error)
{
    if (error) {
        showReportHasNoVisitors(error.getError(), error.getMessage());
    }
}

function doRefresh()
{
    var accountModel = require('session').getAccount();
    var siteModel    = require('session').getWebsite();

    if (!accountModel || !siteModel) {
        console.log('account or site not found, cannot refresh live visitors');
        return;
    }

    showLoadingMessage();
    piwikLiveVisitors.fetchVisitors(accountModel, siteModel.id, render, onFetchError);
}

function restartTimerIfSomeVisitorsAreAlreadyDisplayed() {
    if ($.liveTable && $.liveTable.data && $.liveTable.data.length) {
        // start auto refresh again if user returns to this window from a previous displayed window
        
        startRefreshTimer(20000);
    }
}

function onResume () {
    if ($.liveTable && $.liveTable.data && $.liveTable.data.length) {

        startRefreshTimer(3000);
    }
}

function onPause () {
    if (stopRefreshTimer) {
        stopRefreshTimer();
    }
}

function handleBackgroundEvents()
{
    if (OS_IOS) {
        Ti.App.addEventListener('resume', onResume);
        Ti.App.addEventListener('pause', onPause);
    }

    if (OS_ANDROID) {
        var activity = require('ui/helper').getAndroidActivity($.index);

        if (activity) {
            activity.addEventListener('pause', stopRefreshTimer);
            activity.addEventListener('stop', stopRefreshTimer);
        }
    }
}

function stopHandleBackgroundEvents()
{
    if (OS_IOS) {
        Ti.App.removeEventListener('resume', onResume);
        Ti.App.removeEventListener('pause', onPause);
    }

    if (OS_ANDROID) {
        var activity = require('ui/helper').getAndroidActivity($.index);

        if (activity) {
            activity.removeEventListener('pause', stopRefreshTimer);
            activity.removeEventListener('stop', stopRefreshTimer);
        }
    }
}

function toggleReportConfiguratorVisibility ()
{
    require('report/configurator').toggleVisibility();

    require('Piwik/Tracker').trackEvent({title: 'Toggle Report Configurator', url: '/visitors-in-real-time/toggle/report-configurator'});
}

function toggleReportChooserVisibility()
{
    require('report/chooser').toggleVisibility();

    require('Piwik/Tracker').trackEvent({title: 'Toggle Report Chooser', url: '/visitors-in-real-time/toggle/report-chooser'});
}

exports.open = function () 
{
    registerEvents();
    handleBackgroundEvents();
    require('layout').open($.index);
    doRefresh();
};

function close()
{
    require('layout').close($.index);
}

exports.close   = close;
exports.refresh = doRefresh;
