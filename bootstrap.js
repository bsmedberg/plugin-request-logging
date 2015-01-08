const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;
const Cr = Components.results;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

let gCID;
let gContract;

let kLogURI = "http://stravinsky:8080/plugin-request-log";

function randomCID() {
  return Cc["@mozilla.org/uuid-generator;1"].getService(Ci.nsIUUIDGenerator).generateUUID();
}

let kLogger = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsISupports, Ci.nsIFactory, Ci.nsIContentPolicy]),

  // nsIFactory
  createInstance: function(outer, iid) {
    Cu.reportError("plugin-request-logging: createInstance: " + iid);
    if (outer) {
      throw Cr.NS_ERROR_NO_AGGREGATION;
    }
    return this.QueryInterface(iid);
  },

  // nsIContentPolicy
  shouldLoad: function() {
    return Ci.nsIContentPolicy.ACCEPT;
  },

  shouldProcess: function(type, location, origin, context, mimeType,
    extra, principal) {
    if (type != Ci.nsIContentPolicy.TYPE_OBJECT_SUBREQUEST ||
        !(context instanceof Ci.nsIObjectLoadingContent)) {
      return Ci.nsIContentPolicy.ACCEPT;
    }

    let resourceDomain = location.hostname;

    // We only care about video loads
    if (!mimeType.startsWith("video/")) {
      if (!(location instanceof Ci.nsIURL)) {
        return Ci.nsIContentPolicy.ACCEPT;
      }
      let filePath = location.filePath.toLowerCase();
      if (!(filePath.endsWith(".flv") ||
            filePath.endsWith(".f4v") ||
            filePath.endsWith(".f4p") ||
            filePath.endsWith(".f4a") ||
            filePath.endsWith(".f4b") ||
            filePath.endsWith(".mp4"))) {
        return Ci.nsIContentPolicy.ACCEPT;
      }
    }

    let swfDomain = "?";
    try {
      swfDomain = context.srcURI.host;
    } catch(e) {
      Cu.reportError(e);
    }

    let pageDomain = "?";
    try {
      pageDomain = context.QueryInterface(Ci.nsIDOMNode).ownerDocument.location.hostname;
    } catch(e) {
      Cu.reportError(e);
    }

    let topDomain = "?";
    try {
      topDomain = context.QueryInterface(Ci.nsIDOMNode).ownerDocument.defaultView.top.location.hostname;
    } catch (e) {
      Cu.reportError(e);
    }
    this._log(resourceDomain, swfDomain, pageDomain, topDomain);
    return Ci.nsIContentPolicy.ACCEPT;
  },

  // Helpers
  _log: function(resourceDomain, swfDomain, pageDomain, topDomain) {
    let pingData = {
      version: 1,
      appname: Services.appinfo.name,
      appversion: Services.appinfo.version,
      buildid: Services.appinfo.appBuildID,
      os: Services.appinfo.OS,
      channel: Services.appinfo.defaultUpdateChannel,
      locale: Cc["@mozilla.org/chrome/chrome-registry;1"].getService(Ci.nsIXULChromeRegistry).getSelectedLocale('global'),
      videoOrigin: resourceDomain,
      swfOrigin: swfDomain,
      pageOrigin: pageDomain,
      topOrigin: topDomain,
    };
    let xhr = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].
      createInstance(Ci.nsIXMLHttpRequest);
    xhr.open("PUT", kLogURI, true);
    xhr.addEventListener("error", function(e) {
      Cu.reportError("plugin-request-logging: the ping failed to submit: " + e);
    }, false);
    xhr.send(JSON.stringify(pingData));
  },
};

function startup(data, reason) {
  if (gCID) {
    Cu.reportError("function startup() called twice for plugin-request-logging addon");
    return;
  }
  gCID = randomCID();
  gContract = "plugin-request-logging:random:" + gCID.toString();

  Components.manager.QueryInterface(Ci.nsIComponentRegistrar).
    registerFactory(gCID, null, gContract, kLogger);
  Cc["@mozilla.org/categorymanager;1"].getService(Ci.nsICategoryManager).
    addCategoryEntry("content-policy", gContract, gContract, false, true);
}

function shutdown(data, reason) {
  if (gCID) {
    Components.manager.QueryInterface(Ci.nsIComponentRegistrar).
      unregisterFactory(gCID, kLogger);
    Cc["@mozilla.org/categorymanager;1"].getService(Ci.nsICategoryManager).
      deleteCategoryEntry("content-policy", gContract, false);
    gCID = undefined;
    gContract = undefined;
  }
}
