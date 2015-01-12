const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;
const Cr = Components.results;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "UpdateChannel",
                                  "resource://gre/modules/UpdateChannel.jsm");

let gCID;
let gContract;

const kLogURI = "http://incoming.telemetry.mozilla.org/submit/telemetry/-/flash-video/%NAME%/%VERSION%/%CHANNEL%/%APPBUILDID%";

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

    // We only care about video loads
    if (!mimeType.startsWith("video/")) {
      if (!(location instanceof Ci.nsIURL)) {
        return Ci.nsIContentPolicy.ACCEPT;
      }
      let extension = location.fileExtension.toLowerCase();
      if (!(extension == "flv" ||
            extension == "f4v" ||
            extension == "f4p" ||
            extension == "f4a" ||
            extension == "f4b" ||
            extension == "mp4")) {
        return Ci.nsIContentPolicy.ACCEPT;
      }
    }

    let resourceDomain = location.host;

    let swfDomain = "?";
    try {
      swfDomain = context.srcURI.host;
    } catch(e) {
      Cu.reportError(e);
    }

    let pageDomain = "?";
    try {
      pageDomain = context.ownerDocument.location.hostname;
    } catch(e) {
      Cu.reportError(e);
    }

    let topDomain = "?";
    try {
      topDomain = context.ownerDocument.defaultView.top.location.hostname;
    } catch (e) {
      Cu.reportError(e);
    }
    this._log(resourceDomain, swfDomain, pageDomain, topDomain);
    return Ci.nsIContentPolicy.ACCEPT;
  },

  // Helpers
  _log: function(resourceDomain, swfDomain, pageDomain, topDomain) {
    let pingData = {
      ver: 1,
      info: {
        reason: "flash-video",
        appName: Services.appinfo.name,
        appUpdateChannel: UpdateChannel.get(),
        appVersion: Services.appinfo.version,
        appBuildID: Services.appinfo.appBuildID,
        OS: Services.appinfo.OS,
        locale: Cc["@mozilla.org/chrome/chrome-registry;1"].getService(Ci.nsIXULChromeRegistry).getSelectedLocale('global'),
      },
      videoOrigin: resourceDomain,
      swfOrigin: swfDomain,
      pageOrigin: pageDomain,
      topOrigin: topDomain,
    };
    let url = Services.urlFormatter.formatURL(kLogURI);
    let xhr = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].
      createInstance(Ci.nsIXMLHttpRequest);
    xhr.open("POST", url, true);
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
