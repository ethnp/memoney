/**
* jQuery Mobile angularJS adaper v1.2.1-SNAPSHOT
* http://github.com/tigbro/jquery-mobile-angular-adapter
*
* Copyright 2011, Tobias Bosch (OPITZ CONSULTING GmbH)
* Licensed under the MIT license.
*/
(function(factory) {
if (typeof define === "function" && define.amd) {
define(["jquery", "angular", "jquery.mobile"], factory);
} else {
factory(window.jQuery, window.angular);
}
})(function($, angular) {
(function ($) {
    function patch(obj, fnName, callback) {
        var _old = obj[fnName];
        obj[fnName] = function () {
            return callback(_old, this, arguments);
        }
    }

    // patch for selectmenu when it opens a menu in an own page
    $( document ).bind( "selectmenubeforecreate", function( event ) {
        var selectmenuWidget = $( event.target ).data( "selectmenu" );
        patch(selectmenuWidget, 'close', function (old, self, args) {
            if (self.options.disabled || !self.isOpen) {
                return;
            }
            if (self.menuType === "page") {
                // See mobile.dialog#close for the same logic as here!
                var dst = $.mobile.urlHistory.getPrev().url;
                if (!$.mobile.path.isPath(dst)) {
                    dst = $.mobile.path.makeUrlAbsolute("#" + dst);
                }

                $.mobile.changePage(dst, { changeHash:false, fromHashChange:true });
                self.isOpen = false;
            } else {
                old.apply(self, args);
            }
        });
    });

    // selectmenu may create parent elements and extra pages
    patch($.mobile.selectmenu.prototype, 'destroy', function (old, self, args) {
        old.apply(self, args);
        var menuPage = self.menuPage;
        var screen = self.screen;
        var listbox = self.listbox;
        menuPage && menuPage.remove();
        screen && screen.remove();
        listbox && listbox.remove();
    });

    // native selectmenu throws an error is no option is contained!
    $.mobile.selectmenu.prototype.placeholder = "";


    // Listview may create subpages that need to be removed when the widget is destroyed.
    patch($.mobile.listview.prototype, "destroy", function (old, self, args) {
        // Destroy the widget instance first to prevent
        // a stack overflow.
        // Note: If there are more than 1 listview on the page, childPages will return
        // the child pages of all listviews.
        var id = self.element.attr('id');
        var childPageRegex = new RegExp($.mobile.subPageUrlKey + "=" + id + "-");
        var childPages = self.childPages();
        old.apply(self, args);
        for (var i = 0; i < childPages.length; i++) {
            var childPage = $(childPages[i]);
            var dataUrl = childPage.attr('data-url');
            if (dataUrl.match(childPageRegex)) {
                childPage.remove();
            }
        }
    });

    // refresh of listview should refresh also non visible entries if the
    // listview itself is not visible
    patch($.mobile.listview.prototype, "refresh", function (old, self, args) {
        if (self.element.filter(":visible").length === 0) {
            return old.call(self, true);
        } else {
            return old.apply(self, args);
        }
    });

    // Copy of the initialization code from jquery mobile for controlgroup.
    // Needed in jqm 1.1, as we want to do a manual initialization.
    // See the open task in jqm 1.1 for controlgroup.
    if ($.fn.controlgroup) {
        $(document).bind("pagecreate create", function (e) {
            $(":jqmData(role='controlgroup')", e.target)
                .jqmEnhanceable()
                .controlgroup({ excludeInvisible:false });
        });
    }

    // Patch 1: controlgroup should not exclude invisible children
    // as long as it is not visible itself!
    patch($.fn, "controlgroup", function (old, self, args) {
        if (self.filter(":visible").length === 0) {
            var options = args[0] || {};
            options.excludeInvisible = false;
            return old.call(self, options);
        }
        return old.apply(self, args);
    });

    // collapsible has problems when a collapsible is created with a nested collapsible,
    // if the nested collapsible is created before the outside collapsible.
    var _c = $.fn.collapsible;
    var nestedContentClass = "ui-collapsible-content";
    $.fn.collapsible = function () {
        var nestedContent = this.find(".ui-collapsible-content");
        nestedContent.removeClass(nestedContentClass);
        try {
            return _c.apply(this, arguments);
        } finally {
            nestedContent.addClass(nestedContentClass);
        }
    };

    // navbar does not contain a refresh function, so we add it here.

    patch($.mobile.navbar.prototype, '_create', function (old, self, args) {
        var _find = $.fn.find;
        var navbar = self.element;
        var navbarBtns;
        $.fn.find = function (selector) {
            var res = _find.apply(this, arguments);
            if (selector === 'a') {
                navbar.data('$navbtns', res);
            }
            return res;
        };
        try {
            return old.apply(self, args);
        } finally {
            $.fn.find = _find;
        }
    });

    $.mobile.navbar.prototype.refresh = function () {
        var $navbar = this.element;

        var $navbtns = $navbar.data("$navbtns");
        $navbtns.splice(0, $navbtns.length);
        $.each($navbar.find("a"), function (key, value) {
            $navbtns.push(value);
        });
        var iconpos = $navbtns.filter(":jqmData(icon)").length ?
            this.options.iconpos : undefined;

        var list = $navbar.find("ul");
        var listEntries = list.children("li");
        list.removeClass(function (index, css) {
            return (css.match(/\bui-grid-\S+/g) || []).join(' ');
        });
        listEntries.removeClass(function (index, css) {
            return (css.match(/\bui-block-\S+/g) || []).join(' ');
        });
        list.jqmEnhanceable().grid({ grid:this.options.grid });

        $navbtns.buttonMarkup({
            corners:false,
            shadow:false,
            inline:true,
            iconpos:iconpos
        });
    };
})(window.jQuery);
/**
 * Helper that introduces the concept of precompilation: Preprocess the dom before
 * angular processes it.
 * <p>
 * Usage: Create a decorator or a factory for the $precompile service.
 */
(function ($, angular) {
    var ng = angular.module('ng');
    ng.provider("$precompile", $precompileProvider);
    ng.config(['$provide', precompileCompileDecorator]);
    ng.config(['$compileProvider', '$provide', precompileTemplateDirectives]);

    return;

    // ------------------

    function $precompileProvider() {
        var handlers = [];
        return {
            addHandler: function(handler) {
                handlers.push(handler);
            },
            $get: ["$injector", function($injector) {
                return function(element) {
                    var i;
                    for (i=0; i<element.length; i++) {
                        element = $injector.invoke(handlers[i], this, {element: element});
                    }
                    return element;
                }
            }]
        };
    }

    function precompileCompileDecorator($provide) {
        $provide.decorator('$compile', ['$precompile', '$delegate', function ($precompile, $compile) {
            return function () {
                arguments[0] = $precompile(arguments[0]);
                return $compile.apply(this, arguments);
            }
        }]);
    }

    function precompileHtmlString(html, $precompile) {
        var $template = $('<div>' + html + '</div>');
        $precompile($template.contents());
        return $template.html();
    }

    function precompileTemplateDirectives ($compileProvider, $provide) {
        var directiveTemplateUrls = {};

        // Hook into the registration of directives to:
        // - preprocess template html
        // - mark urls from templateUrls so we can preprocess it later in $http
        var _directive = $compileProvider.directive;
        $compileProvider.directive = function (name, factory) {
            var newFactory = function ($precompile, $injector) {
                var res = $injector.invoke(factory);
                if (res.template) {
                    res.template = precompileHtmlString(res.template, $precompile);
                } else if (res.templateUrl) {
                    directiveTemplateUrls[res.templateUrl] = true;
                }
                return res;
            };
            return _directive.call(this, name, ['$precompile', '$injector', newFactory]);
        };

        // preprocess $http results for templateUrls.
        $provide.decorator('$http', ['$q', '$delegate', '$precompile', function ($q, $http, $precompile) {
            var _get = $http.get;
            $http.get = function (url) {
                var res = _get.apply(this, arguments);
                if (directiveTemplateUrls[url]) {
                    var _success = res.success;
                    res.success = function(callback) {
                        var newCallback = function() {
                            var content = arguments[0];
                            arguments[0] = precompileHtmlString(content, $precompile);
                            return callback.apply(this, arguments);
                        };
                        return _success(newCallback);
                    };
                }
                return res;
            };
            return $http;
        }]);
    }

})($, angular);
(function (angular) {

    var ng = angular.module('ng');
    ng.config(['$provide', function($provide) {
        $provide.decorator('$rootScope', ['$delegate', scopeReconnectDecorator]);
    }]);

    function scopeReconnectDecorator($rootScope) {
        $rootScope.$disconnect = function() {
            if (this.$root == this) return; // we can't disconnect the root node;
            var parent = this.$parent;
            this.$$disconnected = true;
            // See Scope.$destroy
            if (parent.$$childHead == this) parent.$$childHead = this.$$nextSibling;
            if (parent.$$childTail == this) parent.$$childTail = this.$$prevSibling;
            if (this.$$prevSibling) this.$$prevSibling.$$nextSibling = this.$$nextSibling;
            if (this.$$nextSibling) this.$$nextSibling.$$prevSibling = this.$$prevSibling;
            this.$$nextSibling = this.$$prevSibling = null;
        };
        $rootScope.$reconnect = function() {
            if (this.$root == this) return; // we can't disconnect the root node;
            var child = this;
            if (!child.$$disconnected) {
                return;
            }
            var parent = child.$parent;
            child.$$disconnected = false;
            // See Scope.$new for this logic...
            child.$$prevSibling = parent.$$childTail;
            if (parent.$$childHead) {
                parent.$$childTail.$$nextSibling = child;
                parent.$$childTail = child;
            } else {
                parent.$$childHead = parent.$$childTail = child;
            }

        };
        return $rootScope;
    }
})(angular);
(function (angular) {
    var ng = angular.module('ng');
    ng.config(['$provide', function ($provide) {
        $provide.decorator('$rootScope', ['$delegate', scopeReentranceDecorator]);
    }]);

    function scopeReentranceDecorator($rootScope) {
        var _apply = $rootScope.$apply;
        $rootScope.$apply = function () {
            if ($rootScope.$$phase) {
                return $rootScope.$eval.apply(this, arguments);
            }
            return _apply.apply(this, arguments);
        };
        var _digest = $rootScope.$digest;
        $rootScope.$digest = function () {
            if ($rootScope.$$phase) {
                return;
            }
            var res = _digest.apply(this, arguments);
        };
        return $rootScope;
    }
})(angular);
(function ($, angular) {
    var ng = angular.module('ng'),
        jqmInitialized = false,
        lastCreatedPages = [];

    $.mobile.autoInitializePage = false;

    ng.config(['$provide', function ($provide) {
        $provide.decorator('$rootScope', ['$delegate', digestOnlyCurrentScopeDecorator]);
    }]);

    ng.config(["$precompileProvider", function($precompile) {
        $precompile.addHandler(["jqmNgWidget", "element", precompilePageAndWidgets]);
    }]);
    ng.run(['$rootScope', '$compile', 'jqmNgWidget', initExternalJqmPagesOnLoad]);

    ng.directive('ngmPage', ["jqmNgWidget", ngmPageDirective]);

    return;

    // -------------------------
    // implementation functions

    // Only digest the $.mobile.activePage when rootScope.$digest is called.
    function digestOnlyCurrentScopeDecorator($rootScope) {
        var _$digest = $rootScope.$digest;
        var lastActiveScope;
        $rootScope.$digest = function () {
            if (this === $rootScope) {
                var p = $.mobile.activePage;
                var activeScope = p && p.scope();
                if (lastActiveScope && lastActiveScope !== activeScope) {
                    lastActiveScope.$disconnect();
                }
                lastActiveScope = activeScope;
                if (activeScope) {
                    activeScope.$reconnect();
                }
            }
            var res = _$digest.apply(this, arguments);
            if (this === $rootScope) {
                var hasPages = lastCreatedPages.length;
                while (lastCreatedPages.length) {
                    var pageScope = lastCreatedPages.shift();
                    // Detach the scope of the created pages from the normal $digest cycle.
                    // Needed so that only $.mobile.activePage gets digested when rootScope.$digest
                    // is called.
                    // However, allow one digest to process every page
                    // so that we can use ng-repeat also for jqm pages!
                    pageScope.$disconnect();
                }
                if (hasPages && !jqmInitialized) {
                    jqmInitialized = true;
                    var _changePage = $.mobile.changePage;
                    $.mobile.changePage = function () {};
                    //$.mobile.changePage.defaults = _changePage.defaults;
                    try {
                        $.mobile.initializePage();
                    } finally {
                        $.mobile.changePage = _changePage;
                    }
                    $rootScope.$broadcast("jqmInit");
                }
            }

            return res;
        };
        return $rootScope;
    }

    /**
     * This $precompile handler will enhance the dom during compile
     * with non widget markup. This will also mark elements that contain
     * jqm widgets.
     */
    function precompilePageAndWidgets(jqmNgWidget, element) {
        var pageSelector = ':jqmData(role="page"), :jqmData(role="dialog")';
        // save the old parent
        var oldParentNode = element[0].parentNode;

        // if the element is not connected with the document element,
        // the enhancements of jquery mobile do not work (uses event listeners for the document).
        // So temporarily connect it...
        connectToDocument(element[0], markPagesAndWidgetsAndApplyNonWidgetMarkup);

        // If the element wrapped itself into a new element,
        // return the element that is under the same original parent
        while (element[0].parentNode !== oldParentNode) {
            element = element.eq(0).parent();
        }

        return element;

        // --------------
        function markPagesAndWidgetsAndApplyNonWidgetMarkup() {
            var pages = element.find(pageSelector).add(element.filter(pageSelector));
            pages.attr("ngm-page", "true");

            // enhance non-widgets markup.
            jqmNgWidget.markJqmWidgetCreation(function () {
                jqmNgWidget.preventJqmWidgetCreation(function () {
                    if (pages.length > 0) {
                        // element contains pages.
                        // create temporary pages for the non widget markup, that we destroy afterwards.
                        // This is ok as non widget markup does not hold state, i.e. no permanent reference to the page.
                        pages.page();
                    } else {
                        element.parent().trigger("create");
                    }
                });
            });

            // Destroy the temporary pages again
            pages.page("destroy");
        }
    }

    function connectToDocument(node, callback) {
        if (!node.parentNode) {
            return callback();
        }
        // search the top most element for node.
        while (node.parentNode && node.parentNode.nodeType === 1) {
            node = node.parentNode;
        }
        var oldParentNode = node.parentNode;
        if (oldParentNode !== document) {
            document.documentElement.appendChild(node);
        }
        try {
            return callback();
        } finally {
            if (oldParentNode !== document) {
                oldParentNode.appendChild(node);
            }
        }
    }

    /**
     * Special directive for pages, as they need an own scope.
     */
    function ngmPageDirective(jqmNgWidget) {
        return {
            restrict:'A',
            scope:true,
            compile:function (tElement, tAttrs) {
                tElement.removeAttr("ngm-page");
                return {
                    pre:function (scope, iElement, iAttrs) {
                        if (!$.mobile.pageContainer) {
                            $.mobile.pageContainer = iElement.parent().addClass("ui-mobile-viewport");
                        }

                        // Create the page widget without the pagecreate-Event.
                        // This does no dom transformation, so it's safe to call this in the prelink function.
                        createPagesWithoutPageCreateEvent(jqmNgWidget, iElement);
                        lastCreatedPages.push(scope);
                        iElement.bind('pagebeforeshow', function (event) {
                            var page = $(event.target);
                            scope.$emit("jqmPagebeforeshow", page);
                            scope.$root.$digest();
                        });
                    }
                };
            }
        };
    }

    function createPagesWithoutPageCreateEvent(jqmNgWidget, pages) {
        jqmNgWidget.preventJqmWidgetCreation(function () {
            var oldPrefix = $.mobile.page.prototype.widgetEventPrefix;
            $.mobile.page.prototype.widgetEventPrefix = 'noop';
            pages.page();
            $.mobile.page.prototype.widgetEventPrefix = oldPrefix;
        });
    }

    // If jqm loads a page from an external source, angular needs to compile it too!
    function initExternalJqmPagesOnLoad($rootScope, $compile, jqmNgWidget) {
        jqmNgWidget.patchJq('page', function () {
            if (!jqmNgWidget.preventJqmWidgetCreation() && !this.data("page")) {
                if (this.attr("data-" + $.mobile.ns + "external-page")) {
                    correctRelativeLinks(this);
                    $compile(this)($rootScope);
                }
            }
            return $.fn.orig.page.apply(this, arguments);
        });

        var base = $.mobile.base.element.attr("href");
        function correctRelativeLinks(page) {
            // correct the relative links in this page relative
            // to the page url.
            // Jqm does this when a link is clicked (using link.attr("href"),
            // but we want to use link.prop("href")
            var url = page.jqmData( "url" );
            if ( !url || !$.mobile.path.isPath( url ) ) {
                url = base;
            }
            var pageUrl = $.mobile.path.makeUrlAbsolute( url, base);
            page.find( "a:not([rel='external'], [target])" ).each(function() {
                var $this = $(this),
                    thisUrl = $this.attr( 'href' );
                $this.attr('href', $.mobile.path.makeUrlAbsolute(thisUrl, pageUrl));
            });
        }
    }



})($, angular);
(function($,angular) {
    var ng = angular.module('ng'),
        execFlags = {};

    $.fn.orig = {};

    ng.provider("jqmNgWidget", ["$compileProvider", jqmNgWidgetProvider]);
    ng.run(["jqmNgWidget", function(jqmNgWidget) {
        jqmNgWidget._init();
    }]);

    enableDomManipDelegate("after");
    enableDomManipDelegate("before");
    enableDomManipDelegate("remove");

    return;

    // --------------

    function jqmNgWidgetProvider($compileProvider) {
        var widgetDefs = {},
            widgetInstances = {};

        var provider = {
            widget: function(name, spec) {
                if (arguments.length===1) {
                    return widgetDefs[name];
                }
                widgetDefs[name] = spec;
                addJqmNgWidgetDirective(name, $compileProvider);
            },
            $get: ["$injector", function($injector) {
                return {
                    lookup: function(widgetName) {
                        return widgetInstances[widgetName];
                    },
                    _init: function() {
                        var widgetName, widgetInstance;
                        for (widgetName in widgetDefs) {
                            widgetInstance = widgetInstances[widgetName] = $injector.invoke(widgetDefs[widgetName]);
                            patchJqmWidget(widgetName, widgetInstance);
                        }
                    },
                    preventJqmWidgetCreation: preventJqmWidgetCreation,
                    markJqmWidgetCreation: markJqmWidgetCreation,
                    patchJq: patchJq,
                    createWidget: function(widgetName, iElement, iAttrs) {
                        var initArgs = JSON.parse(iAttrs[calcDirectiveName(widgetName)]);
                        delegateDomManipToWrapper(function() {
                            $.fn.orig[widgetName].apply(iElement, initArgs);
                        }, iElement);
                    },
                    bindDefaultAttrsAndEvents: bindDefaultAttrsAndEvents,
                    bindDisabledAttribute: bindDisabledAttribute,
                    refreshAfterNgModelRender: refreshAfterNgModelRender,
                    refreshOnChildrenChange: refreshOnChildrenChange,
                    triggerAsyncRefresh: triggerAsyncRefresh
                };
            }]
        };

        return provider;
    }

    function calcDirectiveName(widgetName) {
        return "ngm"+widgetName[0].toUpperCase()+widgetName.substring(1);
    }

    function addJqmNgWidgetDirective(widgetName, $compileProvider) {
        var directiveName = calcDirectiveName(widgetName);
        $compileProvider.directive(directiveName, ["jqmNgWidget", directiveImpl]);
        return;

        function directiveImpl(jqmNgWidget) {
            return {
                restrict:'A',
                // after the normal angular widgets like input, ngModel, ...
                priority:0,
                require:['?ngModel'],
                compile:function (tElement, tAttrs) {
                    var initArgs = JSON.parse(tAttrs[directiveName]);
                    return {
                        post:function (scope, iElement, iAttrs, ctrls) {
                            var widgetSpec = jqmNgWidget.lookup(widgetName);
                            widgetSpec.link(widgetName, scope, iElement, iAttrs, ctrls[0]);
                        }
                    };
                }
            };
        }
    }

    function patchJqmWidget(widgetName, widgetInstance) {
        var widgetAttr = "data-ngm-"+widgetName;
        patchJq(widgetName, function () {
            if (markJqmWidgetCreation()) {
                var args = Array.prototype.slice.call(arguments);
                var self = this;
                for (var k = 0; k < self.length; k++) {
                    var element = self.eq(k);
                    if (widgetInstance && widgetInstance.precompile) {
                        widgetInstance.precompile(element, args);
                    }
                    element.attr(widgetAttr, JSON.stringify(args));
                }
            }
            if (preventJqmWidgetCreation()) {
                return false;
            }
            return $.fn.orig[widgetName].apply(this, arguments);
        });
    }

    function patchJq(fnName, callback) {
        $.fn.orig[fnName] = $.fn.orig[fnName] || $.fn[fnName];
        $.fn[fnName] = callback;
    }

    function execWithFlag(flag, fn) {
        if (!fn) {
            return execFlags[flag];
        }
        var old = execFlags[flag];
        execFlags[flag] = true;
        var res = fn();
        execFlags[flag] = old;
        return res;
    }

    function preventJqmWidgetCreation(fn) {
        return execWithFlag('preventJqmWidgetCreation', fn);
    }

    function markJqmWidgetCreation(fn) {
        return execWithFlag('markJqmWidgetCreation', fn);
    }

    function delegateDomManipToWrapper(origCreate, element) {
        var oldParents = Array.prototype.slice.call(element.parents()),
            newParents,
            i,oldParent, newParent;

        oldParents.unshift(element[0]);
        origCreate();
        newParents = Array.prototype.slice.call(element.parents());
        newParents.unshift(element[0]);

        for (i=0; i<oldParents.length; i++) {
            oldParent= oldParents[oldParents.length-i-1];
            newParent = newParents[newParents.length-i-1];
            if (oldParent!==newParent) {
                $(oldParent).data("wrapperDelegate", $(newParent));
                break;
            }
        }
    }

    function enableDomManipDelegate(fnName) {
        var old = $.fn[fnName];
        $.fn[fnName] = function() {
            var delegate,
                arg0 = arguments[0],
                argDelegate;
            delegate = this.data("wrapperDelegate");
            if (arg0 && typeof arg0.data === "function") {
                argDelegate = arg0.data("wrapperDelegate");
                arguments[0] = argDelegate || arguments[0];
            }
            return old.apply(delegate||this, arguments);
        };
    }

    function bindDefaultAttrsAndEvents(widgetName, scope, iElement, iAttrs, ngModelCtrl) {
        var widgetInstance = iElement.data(widgetName);
        if (!widgetInstance) {
            return;
        }
        if (widgetInstance.disable && widgetInstance.enable) {
            bindDisabledAttribute(widgetName, iElement, iAttrs);
        }
        if (widgetInstance.refresh) {
            refreshOnChildrenChange(widgetName, scope, iElement);
            if (ngModelCtrl) {
                refreshAfterNgModelRender(widgetName, scope, iElement, ngModelCtrl);
            }
        }
    }

    function bindDisabledAttribute(widgetName, iElement, iAttrs) {
        iAttrs.$observe("disabled", function (value) {
            if (value) {
                iElement[widgetName]("disable");
            } else {
                iElement[widgetName]("enable");
            }
        });
    }

    function refreshAfterNgModelRender(widgetName, scope, iElement, ngModelCtrl) {
        addCtrlFunctionListener(ngModelCtrl, "$render", function () {
            triggerAsyncRefresh(widgetName, scope, iElement, "refresh");
        });
    }

    function addCtrlFunctionListener(ctrl, ctrlFnName, fn) {
        var listenersName = "_listeners" + ctrlFnName;
        if (!ctrl[listenersName]) {
            ctrl[listenersName] = [];
            var oldFn = ctrl[ctrlFnName];
            ctrl[ctrlFnName] = function () {
                var res = oldFn.apply(this, arguments);
                for (var i = 0; i < ctrl[listenersName].length; i++) {
                    ctrl[listenersName][i]();
                }
                return res;
            };
        }
        ctrl[listenersName].push(fn);
    }

    function refreshOnChildrenChange(widgetName, scope, iElement) {
        iElement.bind("$childrenChanged", function () {
            triggerAsyncRefresh(widgetName, scope, iElement, "refresh");
        });
    }

    function triggerAsyncRefresh(widgetName, scope, iElement, options) {
        var prop = "_refresh" + widgetName;
        var refreshId = (iElement.data(prop) || 0) + 1;
        iElement.data(prop, refreshId);
        scope.$evalAsync(function () {
            if (iElement.data(prop) === refreshId) {
                iElement[widgetName](options);
            }
        });
    }



})(window.jQuery, window.angular);
(function (angular, $) {
    var ng = angular.module("ng");
    ng.config(["jqmNgWidgetProvider", function(jqmNgWidgetProvider) {
        jqmNgWidgetProvider.widget("checkboxradio", ["jqmNgWidget", checkboxRadioWidget]);
        jqmNgWidgetProvider.widget("button", ["jqmNgWidget", buttonWidget]);
        jqmNgWidgetProvider.widget("collapsible", ["jqmNgWidget", "$parse", collapsibleWidget]);
        jqmNgWidgetProvider.widget("dialog", ["jqmNgWidget", dialogWidget]);
        jqmNgWidgetProvider.widget("controlgroup", ["jqmNgWidget", controlgroupWidget]);
        jqmNgWidgetProvider.widget("textinput", ["jqmNgWidget", defaultWidget]);
        jqmNgWidgetProvider.widget("slider", ["jqmNgWidget", defaultWidget]);
        jqmNgWidgetProvider.widget("listview", ["jqmNgWidget", defaultWidget]);
        jqmNgWidgetProvider.widget("collapsibleset", ["jqmNgWidget", defaultWidget]);
        jqmNgWidgetProvider.widget("selectmenu", ["jqmNgWidget", defaultWidget]);
        jqmNgWidgetProvider.widget("navbar", ["jqmNgWidget", defaultWidget]);
        jqmNgWidgetProvider.widget("fixedtoolbar", ["jqmNgWidget", defaultWidget]);
        jqmNgWidgetProvider.widget("popup", ["jqmNgWidget", defaultWidget]);
    }]);

    function defaultWidget(jqmNgWidet) {
        return {
            link: function(widgetName, scope, iElement, iAttrs, ngModelCtrl) {
                jqmNgWidet.createWidget(widgetName, iElement, iAttrs);

                jqmNgWidet.bindDefaultAttrsAndEvents(widgetName, scope, iElement, iAttrs, ngModelCtrl);
            }
        }
    }

    function checkboxRadioWidget(jqmNgWidet) {
        return {
            precompile: checkboxRadioPrecompile,
            link: function(widgetName, scope, iElement, iAttrs, ngModelCtrl) {
                var label = iElement.parent("label");
                if (label.length===0) {
                    throw new Error("Don't use ng-repeat or other conditional directives on checkboxes/radiobuttons directly. Instead, wrap the input into a label and put the directive on that input!");
                }
                jqmNgWidet.createWidget(widgetName, iElement, iAttrs);

                jqmNgWidet.bindDefaultAttrsAndEvents(widgetName, scope, iElement, iAttrs, ngModelCtrl);

                iAttrs.$observe("checked", function (value) {
                    jqmNgWidet.triggerAsyncRefresh(widgetName, scope, iElement, "refresh");
                });
            }
        };

        function checkboxRadioPrecompile(origElement, initArgs) {
            // wrap the input temporarily into it's label (will be undone by the widget).
            // By this, the jqm widget will always
            // use this label, even if there are other labels with the same id on the same page.
            // This is important if we use ng-repeat on checkboxes, as this could
            // create multiple checkboxes with the same id!
            // This needs to be done in the precompile, as otherwise angular compiler could get into trouble
            // when input and label are siblings!
            // See the checkboxradio-Plugin in jqm for the selectors used to locate the label.
            var parentLabel = $(origElement).closest("label");
            var container = $(origElement).closest("form,fieldset,:jqmData(role='page'),:jqmData(role='dialog')");
            if (container.length === 0) {
                container = origElement.parent();
            }
            var label = parentLabel.length ? parentLabel : container.find("label").filter("[for='" + origElement[0].id + "']");
            if (label.length===0) {
                origElement.attr("ng-non-bindable", "true");
            } else {
                label.append(origElement);
            }
        }
    }

    function buttonWidget(jqmNgWidet) {
        return {
            precompile: function(origElement, initArgs) {
                // Add a text node with the value content,
                // as we need a text node later in the jqm button markup!
                if (origElement[0].nodeName === 'INPUT') {
                    var value = origElement.val();
                    origElement.append(document.createTextNode(value));
                }
            },
            link: function(widgetName, scope, iElement, iAttrs, ngModelCtrl) {
                // Button destroys the text node and recreates a new one. This does not work
                // if the text node contains angular expressions, so we move the
                // text node to the right place.
                var textNode = iElement.contents();
                jqmNgWidet.createWidget(widgetName, iElement, iAttrs);
                var textSpan = iElement.parent().find(".ui-btn-text");
                textSpan.empty();
                textSpan.append(textNode);

                jqmNgWidet.bindDefaultAttrsAndEvents(widgetName, scope, iElement, iAttrs, ngModelCtrl);
            }
        }
    }

    function collapsibleWidget(jqmNgWidet, $parse) {
        return {
            link: function(widgetName, scope, iElement, iAttrs, ngModelCtrl) {
                jqmNgWidet.createWidget(widgetName, iElement, iAttrs);
                jqmNgWidet.bindDefaultAttrsAndEvents(widgetName, scope, iElement, iAttrs, ngModelCtrl);
                bindCollapsedAttribute(scope, iElement, iAttrs);
            }
        };

        function bindCollapsedAttribute(scope, iElement, iAttrs) {
            if (iAttrs.collapsed) {
                var collapsedGetter = $parse(iAttrs.collapsed);
                var collapsedSetter = collapsedGetter.assign;
                scope.$watch(collapsedGetter, function (value) {
                    if (value) {
                        iElement.trigger("collapse");
                    } else {
                        iElement.trigger("expand");
                    }
                });
                if (collapsedSetter) {
                    iElement.bind("collapse", function () {
                        scope.$apply(function () {
                            collapsedSetter(scope, true);
                        });
                    });
                    iElement.bind("expand", function () {
                        scope.$apply(function () {
                            collapsedSetter(scope, false);
                        });
                    });
                }
            }
        }
    }

    function dialogWidget(jqmNgWidet) {
        return {
            precompile: dialogPrecompile,
            link: function(widgetName, scope, iElement, iAttrs, ngModelCtrl) {
                jqmNgWidet.createWidget(widgetName, iElement, iAttrs);

                // add handler to enhanced close button manually (the one we added in precompile),
                // and remove the other close button (the one the widget created).
                var closeButtons = iElement.find(':jqmData(role="header") :jqmData(icon="delete")');
                closeButtons.eq(1).bind("click", function() {
                    iElement.dialog("close");
                });
                closeButtons.eq(0).remove();

                jqmNgWidet.bindDefaultAttrsAndEvents(widgetName, scope, iElement, iAttrs, ngModelCtrl);
            }
        };

        // Dialog: separate event binding and dom enhancement.
        // Note: We do need to add the close button during precompile,
        // as the enhancement for the dialog header depends on it (calculation which button is left, right, ...),
        // and that is executed when we create the page widget, which is before the dialog widget is created :-(
        // We cannot adjust the timing of the header enhancement as it is no jqm widget.
        function dialogPrecompile(origElement, initAttrs) {
            var options = $.mobile.dialog.prototype.options;
            var headerCloseButton = $("<a href='#' data-" + $.mobile.ns + "icon='delete' data-" + $.mobile.ns + "iconpos='notext'>" + options.closeBtnText + "</a>");
            origElement.find(":jqmData(role='header')").prepend(headerCloseButton);
            origElement.data('headerCloseButton', headerCloseButton);
        }
    }

    function controlgroupWidget(jqmNgWidet) {
        return {
            link: function(widgetName, scope, iElement, iAttrs, ngModelCtrl) {
                jqmNgWidet.createWidget(widgetName, iElement, iAttrs);

                jqmNgWidet.bindDefaultAttrsAndEvents(widgetName, scope, iElement, iAttrs, ngModelCtrl);
                iElement.bind("$childrenChanged", function () {
                    jqmNgWidet.triggerAsyncRefresh(widgetName, scope, iElement, {});
                });
            }
        }
    }
})(angular, $);
(function ($, angular) {

    var mod = angular.module("ng");

    $.mobile._registerBrowserDecorators = $.mobile._registerBrowserDecorators || [];
    $.mobile._registerBrowserDecorators.push(registerBrowserDecorator);

    mod.config(['$provide', function ($provide) {
        registerBrowserDecorator($provide);
    }]);
    mod.factory('$history', $historyFactory);

    return;

    // ---------------
    // implementation functions

    function registerBrowserDecorator($provide) {
        $provide.decorator('$rootScope', ['$delegate', rootScopeSuppressEventInDigestCycleDecorator]);
        $provide.decorator('$location', ['$delegate', '$history', locationBackDecorator]);
        $provide.decorator('$browser', ['$delegate', browserHashReplaceDecorator]);
        $provide.decorator('$browser', ['$delegate', '$history', '$rootScope', '$injector', browserHistoryDecorator]);

        function rootScopeSuppressEventInDigestCycleDecorator($rootScope) {
            var suppressedEvents = {};
            $rootScope.suppressEventInDigestCycle = function (eventName) {
                suppressedEvents[eventName] = true;
            };
            var _$broadcast = $rootScope.$broadcast;
            $rootScope.$broadcast = function (eventName) {
                if (suppressedEvents[eventName]) {
                    return {};
                }
                return _$broadcast.apply(this, arguments);
            };
            var _$digest = $rootScope.$digest;
            $rootScope.$digest = function () {
                var res = _$digest.apply(this, arguments);
                suppressedEvents = {};
                return res;
            };
            return $rootScope;
        }

        function locationBackDecorator($location, $history) {
            $location.backMode = function () {
                $location.$$replace = "back";
                return this;
            };
            $location.goBack = function () {
                if ($history.activeIndex <= 0) {
                    throw new Error("There is no page in the history to go back to!");
                }
                this.$$parse($history.urlStack[$history.activeIndex - 1]);
                this.backMode();
                return this;
            };
            return $location;
        }

        function browserHashReplaceDecorator($browser) {
            var _url = $browser.url;
            $browser.url = function() {
                var res = _url.apply(this, arguments);
                if (arguments.length===0) {
                    res = res.replace(/%23/g,'#');
                }
                return res;
            };
            return $browser;
        }

        function browserHistoryDecorator($browser, $history, $rootScope, $injector) {
            var _url = $browser.url;
            var cachedRouteOverride = null;
            $browser.url = function (url, replace) {
                if (url) {
                    // setter
                    var res = $history.onUrlChangeProgrammatically(url, replace === true, replace === 'back');
                    if (res === false) {
                        // cancel navigation and rely on the callback
                        // from browser history.
                        var $location = $injector.get('$location');
                        cachedRouteOverride = $location.routeOverride();
                        $location.$$parse(_url.call(this));
                        // suppress $locationChangeSuccess and $locationChangeStart event in this eval loop,
                        // so the routes don't get updated!
                        $rootScope.suppressEventInDigestCycle('$locationChangeStart');
                        $rootScope.suppressEventInDigestCycle('$locationChangeSuccess');
                        return;
                    }
                }
                return _url.apply(this, arguments);
            };
            var _onUrlChange = $browser.onUrlChange;
            $browser.onUrlChange(function (newUrl) {
                if (cachedRouteOverride) {
                    var $location = $injector.get('$location');
                    $location.routeOverride(cachedRouteOverride);
                }
                $history.onUrlChangeBrowser(newUrl);
            });
            return $browser;
        }
    }

    function $historyFactory() {
        var $history;

        function go(relativeIndex) {
            // Always execute history.go asynchronously.
            // This is required as firefox and IE10 trigger the popstate event
            // in sync, which would result in problems, as
            // in backMode we stop the normal navigation by stopping the $locationChangeSuccess event.
            // However, if we would trigger a popstate event here in sync,
            // the $locationChangeSuccess event from the poped state event would also be swallowed!
            // We have a ui test for this (see ngmRoutingUiSpec#$location.back).
            window.setTimeout(function() {
                window.history.go(relativeIndex);
            },0);
        }

        function onUrlChangeBrowser(url) {
            $history.activeIndex = $history.urlStack.indexOf(url);
            if ($history.activeIndex === -1) {
                onUrlChangeProgrammatically(url, false);
            } else {
                $history.fromUrlChange = true;
            }
        }

        function onUrlChangeProgrammatically(url, replace, back) {
            if (back) {
                var currIndex = $history.activeIndex;
                var newIndex;
                for (newIndex = currIndex - 1; newIndex >= 0 && $history.urlStack[newIndex] !== url; newIndex--);
                if (newIndex !== -1 && currIndex !== -1) {
                    $history.go(newIndex - currIndex);
                    // stop the normal navigation!
                    return false;
                }
            }
            if ($history.urlStack[$history.activeIndex] === url) {
                return;
            }
            $history.fromUrlChange = false;
            if (!replace) {
                $history.activeIndex++;
            }
            $history.urlStack.splice($history.activeIndex, $history.urlStack.length - $history.activeIndex);
            $history.urlStack.push(url);
        }

        return $history = {
            go:go,
            urlStack:[],
            activeIndex:-1,
            fromUrlChange:false,
            onUrlChangeProgrammatically:onUrlChangeProgrammatically,
            onUrlChangeBrowser:onUrlChangeBrowser
        };
    }
})(window.jQuery, window.angular);
/**
 * This combines the routing of angular and jquery mobile. In detail, it deactivates the routing in jqm
 * and reuses that of angular.
 */
(function (angular, $) {
    var DEFAULT_JQM_PAGE = 'DEFAULT_JQM_PAGE',
        DIALOG_URL = '/' + $.mobile.dialogHashKey,
        mod = angular.module("ng");

    $.mobile._registerBrowserDecorators = $.mobile._registerBrowserDecorators || [];
    $.mobile._registerBrowserDecorators.push(registerBrowserDecorator);

    mod.config(['$provide', function ($provide) {
        registerBrowserDecorator($provide);
    }]);

    disableJqmHashChange();

    // html5 mode is always required, so we are able to allow links like
    // <a href="somePage.html"> to load external pages.
    mod.config(['$locationProvider', function ($locationProvider) {
        $locationProvider.html5Mode(true);
        $locationProvider.hashPrefix('!');
    }]);

    mod.directive('ngView', function () {
        throw new Error("ngView is not allowed and not needed with the jqm adapter.");
    });

    patchAngularToAllowVclicksOnEmptyAnchorTags();

    mod.config(['$routeProvider', configMobileRoutes]);
    mod.run(["$rootScope", "$location", applyRouteOverrideOnRouteChangeStart]);
    mod.run(["$rootScope", "$location", navigateToDialgUrlOnDialogShow]);
    mod.run(["$rootScope", "$route", "$routeParams", evalOnActivateOnPageShow]);
    mod.run(["$rootScope", "$route", "$location", "$browser", "$history",applyDefaultNavigationOnRouteChangeSuccess]);
    mod.run(["$rootScope", "$location", removeDialogUrlWhenLocationHashChangesInDialog]);
    mod.run(["$rootScope", "$location", instrumentPopupCloseToNavigateBackWhenDialogUrlIsSet]);
    mod.run(["$rootScope", "$location", instrumentDialogCloseToNavigateBackWhenDialogUrlIsSet]);

    function registerBrowserDecorator($provide) {
        $provide.decorator('$location', ['$delegate', locationRouteOverrideDecorator]);
        $provide.decorator('$browser', ['$delegate', allowFileUrlsInBaseHref]);
        $provide.decorator('$browser', ['$delegate', removeDialogUrlOnUrlChange]);
    }

    function patchAngularToAllowVclicksOnEmptyAnchorTags() {
        // Problem 1:
        // Angular has a directive for links with an empty "href" attribute.
        // This directive has a click-listener which prevents the default action
        // and stops the propagation of the event to parent elements.
        // However, for simulating vclicks in desktop browsers, jQuery Mobile has a click-listener
        // on the document. As angular stops propagation of the event, jQuery Mobile never
        // receives it and therefore never fires the vclick event.

        // Problem 2:
        // Links with a href-Attribute of value "#" are noops in plain jquery mobile apps
        // (see e.g. the close button of dialogs).
        // However, angular interprets such links as a normal link and by this updates
        // the hash of $location-service to be empty.

        // Solution part1: new directive that sets the href-Attribute of all links to "#". By this,
        // the mentioned angular directive for links with empty href-Attributes does no more apply
        mod.directive('a', allowEmptyAnchorLinkDirective);
        // Solution part2: patch the listener for clicks in angular that updates $location to only be executed
        // when the href-Attribute of a link is not equal to "#". Otherwise still prevent the default action,
        // so that the browser does not update the browser location directly.
        // Here we just prevent angular from installing it's default click handler
        // and create our own.
        mod.config(['$locationProvider', replaceDefaultClickHandlerLocationDecorator]);
    }

    return;


    // ------------------

    function allowFileUrlsInBaseHref($browser) {
        var _baseHref = $browser.baseHref;
        $browser.baseHref = function () {
            // Patch for baseHref to return the correct path also for file-urls.
            // See bug https://github.com/angular/angular.js/issues/1690
            var href = _baseHref.call(this);
            return href ? href.replace(/^file?\:\/\/[^\/]*/, '') : href;
        };
        return $browser;
    }


    function removeDialogUrlOnUrlChange($browser) {
        // Always set replace to true if leaving a dialog-url
        // Attention: This needs to be AFTER the decorator for $browser.url in history.js,
        // so our internal history is also up-to-date. There is a test for this though...
        var _url = $browser.url;
        $browser.url = function (url, replace) {
            var oldUrl;
            if (url) {
                oldUrl = _url.call(this);
                if (oldUrl.indexOf(DIALOG_URL)!=-1) {
                    replace = true;
                }
                return _url.call(this, url, replace);
            }
            return _url.apply(this, arguments);
        };
        return $browser;
    }

    function locationRouteOverrideDecorator($location) {
        $location.routeOverride = function (routeOverride) {
            if (arguments.length === 0) {
                return $location.$$routeOverride;
            }
            $location.$$routeOverride = routeOverride;
            return this;
        };

        // If we start the app with a url like
        // index.html?a=b#!/somePage.html, i.e.
        // we have a search parameter and load an external subpage,
        // then angular does not parse the given hashbang url correctly.
        // Here, we correct the wrong parsing.
        var hash = $location.hash();
        if (hash && hash.indexOf('!') === 0) {
            $location.search({});
            $location.url(hash.substring(1));
        }

        return $location;
    }

    // This needs to be outside of a angular config callback, as jqm reads this during initialization.
    function disableJqmHashChange() {
        $.mobile.pushStateEnabled = false;
        $.mobile.hashListeningEnabled = false;
        $.mobile.linkBindingEnabled = false;
        $.mobile.changePage.defaults.changeHash = false;
        $.mobile._handleHashChange = function () {
        };
        // We deactivate dynamic base tag,
        // e.g. so that xhrs are always against the
        // url with which the app was started!
        if ($.support.dynamicBaseTag) {
            $.support.dynamicBaseTag = false;
            $.mobile.base.set = function () {
            };
        }
        $.mobile.changePage.defaults.allowSamePageTransition = true;
    }


    function configMobileRoutes($routeProvider) {
        var _when = $routeProvider.when;
        $routeProvider.when = function (path, params) {
            if (!params.templateUrl && !params.redirectTo) {
                throw new Error("Only routes with templateUrl or redirectTo are allowed with the jqm adapter!");
            }
            if (params.controller) {
                throw new Error("Controllers are not allowed on routes with the jqm adapter. However, you may use the onActivate parameter");
            }
            return _when.apply(this, arguments);
        };

        $routeProvider.when(DIALOG_URL, {
            templateUrl:DEFAULT_JQM_PAGE
        });

        $routeProvider.otherwise({
            templateUrl:DEFAULT_JQM_PAGE
        });
    }

    function getBasePath(path) {
        return path.substr(0, path.lastIndexOf('/'));
    }

    function applyRouteOverrideOnRouteChangeStart($rootScope, $location) {
        $rootScope.$on('$routeChangeStart', function(event, newRoute) {
            var routeOverride = $location.$$routeOverride;
            delete $location.$$routeOverride;
            if (routeOverride) {
                if (routeOverride.onActivate) {
                    newRoute.onActivate = routeOverride.onActivate;
                }
                newRoute.jqmOptions = newRoute.jqmOptions || {};
                angular.extend(newRoute.jqmOptions, routeOverride.jqmOptions);

                newRoute.resolve = newRoute.resolve || {};
                angular.forEach(routeOverride.locals, function (value, key) {
                    newRoute.resolve[key] = function () {
                        return value;
                    };
                });
            }

            // Prevent angular from loading the template, as jquery mobile already does this!
            newRoute.ngmTemplateUrl = newRoute.templateUrl;
            newRoute.templateUrl = undefined;
        });
    }


    function navigateToDialgUrlOnDialogShow($rootScope, $location) {
        $rootScope.$on('jqmPagebeforeshow', function() {
            if (activePageIsDialog()) {
                dialogUrl($location, true);
            }
        });
    }

    function evalOnActivateOnPageShow($rootScope, $route, $routeParams) {
        $rootScope.$on('jqmPagebeforeshow', function(event) {
            var current = $route.current,
                onActivateParams;
            if (current && current.onActivate) {
                onActivateParams = angular.extend({}, current.locals, $routeParams);
                event.targetScope.$eval(current.onActivate, onActivateParams);
            }
        });
    }

    function activePageIsDialog() {
        return $.mobile.activePage && $.mobile.activePage.jqmData("role") === "dialog";
    }

    function applyDefaultNavigationOnRouteChangeSuccess($rootScope, $route, $location, $browser, $history) {
        $rootScope.$on('$routeChangeSuccess', function() {
            var newRoute = $route.current;
            var $document = $(document);

            var url = newRoute.ngmTemplateUrl;
            if (url === DEFAULT_JQM_PAGE) {
                if (dialogUrl($location)) {
                    return;
                }
                var url = $location.url();
                var baseHref = $browser.baseHref();
                if (url.indexOf('/') === -1) {
                    url = baseHref + url;
                } else {
                    url = getBasePath(baseHref) + url;
                }
            }
            if (!url) {
                return;
            }
            var navConfig = newRoute.jqmOptions = newRoute.jqmOptions || {};
            if ($history.fromUrlChange) {
                navConfig.fromHashChange = true;
            }

            if (!$.mobile.firstPage) {
                $rootScope.$on("jqmInit", startNavigation);
            } else {
                startNavigation();
            }

            function startNavigation() {
                $.mobile.changePage(url, navConfig);
                if ($.mobile.popup.active) {
                    // Popup are available without loading,
                    // so we can check them right after calling $.mobile.changePage!
                    dialogUrl($location, true);
                }
            }
        });
    }

    function removeDialogUrlWhenLocationHashChangesInDialog($rootScope, $location) {
        $rootScope.$on('$locationChangeStart', function() {
            var hash = $location.hash();
            if (dialogUrl($location)) {
                if (hash) {
                    $location.$$parse($location.$$urlBeforeDialog);
                    $location.hash(hash);
                }
            }
        });
        $rootScope.$on('$locationChangeSuccess', function(event, newLocation, oldLocation) {
            if (oldLocation && oldLocation.indexOf(DIALOG_URL)!==-1) {
                delete $location.$$urlBeforeDialog;
            }
        });
    }

    function instrumentPopupCloseToNavigateBackWhenDialogUrlIsSet($rootScope, $location) {
        var popupProto = $.mobile.popup.prototype;
        var _open = popupProto._open;
        popupProto._open = function() {
            this.firstPopup = !activePageIsDialog();
            return _open.apply(this, arguments);
        };
        var _close = popupProto._close;
        popupProto._close = function () {
            if (dialogUrl($location) && this.firstPopup) {
                $rootScope.$apply(function () {
                    $location.goBack();
                });
            } else {
                _close.apply(this, arguments);
            }
        };
    }

    function instrumentDialogCloseToNavigateBackWhenDialogUrlIsSet($rootScope, $location) {
        var dialogProto = $.mobile.dialog.prototype;
        dialogProto.origClose = dialogProto.close;
        dialogProto.close = function () {
            if (this._isCloseable && dialogUrl($location)) {
                this._isCloseable = false;
                $rootScope.$apply(function () {
                    $location.goBack();
                });
            } else {
                this.origClose();
            }
        };
    }

    // gets or sets a dialog url.
    // We use the same behaviour as in jQuery Mobile: dialog urls
    // are here for allowing users to click "back" to close the dialog,
    // but prevent him from opening them again via "forward".
    function dialogUrl($location) {
        if (arguments.length === 1) {
            // getter
            return $location.path() === DIALOG_URL;
        }
        // setter
        $location.$$urlBeforeDialog = $location.absUrl();
        $location.url(DIALOG_URL);
        $location.replace();
    }

    function defaultClickHandler(event, iElement, $scope, $location) {
        // Attention: Do NOT stopPropagation, as otherwise
        // jquery Mobile will not generate a vclick event!
        var rel = iElement.jqmData("rel");
        if (rel === 'back') {
            event.preventDefault();
            $scope.$apply(function () {
                $location.goBack();
            });
        } else if (isNoopLink(iElement)) {
            event.preventDefault();
        } else {
            var absHref = iElement.prop('href'),
                rewrittenUrl = $location.$$rewriteAppUrl(absHref),
                ajax = iElement.jqmData("ajax");

            if (absHref && !iElement.attr('target') && ajax !== false && rel !== 'external' && rewrittenUrl) {
                // See original angular default click handler:
                // update location manually
                $location.$$parse(rewrittenUrl);
                event.preventDefault();
                // hack to work around FF6 bug 684208 when scenario runner clicks on links
                window.angular['ff-684208-preventDefault'] = true;
                // Additional handling
                var override = $location.routeOverride() || {};
                var jqmOptions = override.jqmOptions = {
                    link:iElement
                };
                if (rel) {
                    jqmOptions.role = rel;
                }
                var trans = iElement.jqmData("transition");
                if (trans) {
                    jqmOptions.transition = trans;
                }
                var direction = iElement.jqmData("direction");
                if (direction) {
                    jqmOptions.reverse = direction === "reverse";
                }
                $location.routeOverride(override);
                $scope.$apply();
            }
        }
    }

    function isNoopLink(element) {
        var href = element.attr('href');
        return (href === '#' || !href);
    }

    function allowEmptyAnchorLinkDirective() {
        return {
            restrict:'E',
            compile:function (element, attr) {
                if (isNoopLink(element)) {
                    attr.$set('href', '#');
                }
            }
        };
    }

    function replaceDefaultClickHandlerLocationDecorator($locationProvider) {
        var orig$get = $locationProvider.$get;
        $locationProvider.$get = ['$injector', '$rootElement', '$rootScope', '$browser', function ($injector, $rootElement, $rootScope, $browser) {
            var $location = preventClickHandlersOnRootElementWhileCalling($rootElement,
                function () {
                    return $injector.invoke(orig$get, $locationProvider);
                });
            // Note: Some of this click handler was copied from the original
            // default click handler in angular.
            $rootElement.bind('click', function (event) {
                // TODO(vojta): rewrite link when opening in new tab/window (in legacy browser)
                // currently we open nice url link and redirect then

                if (event.ctrlKey || event.metaKey || event.which == 2) return;

                var elm = $(event.target);

                // traverse the DOM up to find first A tag
                while (angular.lowercase(elm[0].nodeName) !== 'a') {
                    // ignore rewriting if no A tag (reached root element, or no parent - removed from document)
                    if (elm[0] === $rootElement[0] || !(elm = elm.parent())[0]) return;
                }
                defaultClickHandler(event, elm, $rootScope, $location);
            });
            return $location;
        }];
    }

    function preventClickHandlersOnRootElementWhileCalling($rootElement, callback) {
        var _bind = $.fn.bind;
        try {
            $.fn.bind = function (eventName) {
                if (eventName === 'click' && this[0] === $rootElement[0]) {
                    return;
                }
                return _bind.apply(this, arguments);
            };
            return callback();
        }
        finally {
            $.fn.bind = _bind;
        }
    }


})(angular, $);
(function ($, angular) {
    // Patch for ng-repeat to fire an event whenever the children change.
    // Only watching Scope create/destroy is not enough here, as ng-repeat
    // caches the scopes during reordering.

    function shallowEquals(collection1, collection2) {
        if (!!collection1 ^ !!collection2) {
            return false;
        }
        for (var x in collection1) {
            if (collection2[x] !== collection1[x]) {
                return false;
            }
        }
        for (var x in collection2) {
            if (collection2[x] !== collection1[x]) {
                return false;
            }
        }
        return true;
    }

    function shallowClone(collection) {
        if (!collection) {
            return collection;
        }
        var res;
        if (collection.length) {
            res = [];
        } else {
            res = {};
        }
        for (var x in collection) {
            res[x] = collection[x];
        }
        return res;
    }

    var mod = angular.module('ng');
    mod.directive('ngRepeat', function () {
        return {
            priority:1000, // same as original repeat
            compile:function (element, attr, linker) {
                return {
                    pre:function (scope, iterStartElement, attr) {
                        var expression = attr.ngRepeat;
                        var match = expression.match(/^.+in\s+(.*)\s*$/);
                        if (!match) {
                            throw Error("Expected ngRepeat in form of '_item_ in _collection_' but got '" +
                                expression + "'.");
                        }
                        var collectionExpr = match[1];
                        var lastCollection;
                        var changeCounter = 0;
                        scope.$watch(function () {
                            var collection = scope.$eval(collectionExpr);
                            if (!shallowEquals(collection, lastCollection)) {
                                lastCollection = shallowClone(collection);
                                changeCounter++;
                            }
                            return changeCounter;
                        }, function () {
                            // Note: need to be parent() as jquery cannot trigger events on comments
                            // (angular creates a comment node when using transclusion, as ng-repeat does).
                            iterStartElement.parent().trigger("$childrenChanged");
                        });
                    }
                };
            }
        };
    });
})($, angular);
(function ($, angular) {
    // This is a copy of parts of angular's ngOptions directive to detect changes in the values
    // of ngOptions (emits the $childrenChanged event on the scope).
    // This is needed as ngOptions does not provide a way to listen to changes.

    function sortedKeys(obj) {
        var keys = [];
        for (var key in obj) {
            if (obj.hasOwnProperty(key)) {
                keys.push(key);
            }
        }
        return keys.sort();
    }

    var NG_OPTIONS_REGEXP = /^\s*(.*?)(?:\s+as\s+(.*?))?(?:\s+group\s+by\s+(.*))?\s+for\s+(?:([\$\w][\$\w\d]*)|(?:\(\s*([\$\w][\$\w\d]*)\s*,\s*([\$\w][\$\w\d]*)\s*\)))\s+in\s+(.*)$/;
    var mod = angular.module('ng');
    mod.directive('ngOptions', ['$parse', function ($parse) {
        return {
            require: ['select', '?ngModel'],
            link:function (scope, element, attr, ctrls) {
                // if ngModel is not defined, we don't need to do anything
                if (!ctrls[1]) return;

                var match;
                var optionsExp = attr.ngOptions;

                if (! (match = optionsExp.match(NG_OPTIONS_REGEXP))) {
                    throw Error(
                        "Expected ngOptions in form of '_select_ (as _label_)? for (_key_,)?_value_ in _collection_'" +
                            " but got '" + optionsExp + "'.");
                }

                var displayFn = $parse(match[2] || match[1]),
                    valueName = match[4] || match[6],
                    keyName = match[5],
                    groupByFn = $parse(match[3] || ''),
                    valueFn = $parse(match[2] ? match[1] : valueName),
                    valuesFn = $parse(match[7]);

                scope.$watch(optionsModel, function() {
                    element.trigger("$childrenChanged");
                }, true);

                function optionsModel() {
                    var optionGroups = [], // Temporary location for the option groups before we render them
                        optionGroupName,
                        values = valuesFn(scope) || [],
                        keys = keyName ? sortedKeys(values) : values,
                        length,
                        index,
                        locals = {};

                    // We now build up the list of options we need (we merge later)
                    for (index = 0; length = keys.length, index < length; index++) {
                        var value = values[index];
                        locals[valueName] = values[keyName ? locals[keyName]=keys[index]:index];
                        optionGroupName = groupByFn(scope, locals);
                        optionGroups.push({
                            id: keyName ? keys[index] : index,   // either the index into array or key from object
                            label: displayFn(scope, locals), // what will be seen by the user
                            optionGroup: optionGroupName
                        });
                    }
                    return optionGroups;
                }
            }
        };
    }]);


})($, angular);
(function (angular) {
    var ng = angular.module("ng");
    ng.directive('option', ['$interpolate', function ($interpolate) {
        return {
            restrict:'E',
            compile:function (tElement, tAttrs) {
                var textInterpolateFn = $interpolate(tElement.text(), true);
                var valueInterpolateFn = $interpolate(tElement.attr('value'), true);
                return function (scope, iElement, iAttrs) {
                    scope.$watch(textInterpolateFn, function () {
                        iElement.trigger("$childrenChanged");
                    });
                    scope.$watch(valueInterpolateFn, function () {
                        iElement.trigger("$childrenChanged");
                    });
                }
            }
        };
    }]);
})(angular);
(function (angular) {
    var ng = angular.module("ng");
    ng.directive('li', function() {
        return {
            restrict:'E',
            compile:function (tElement, tAttrs) {
                return function (scope, iElement, iAttrs) {
                    iElement.bind("$childrenChanged", function () {
                        iElement.removeClass(function(a,css) { return (css.match (/\bui-\S+/g) || []).join(' '); });
                        var buttonElements = iElement.data("buttonElements");
                        if (buttonElements) {
                            var text = buttonElements.text;
                            while (text.firstChild) {
                                iElement[0].appendChild(text.firstChild);
                            }
                            $(buttonElements.inner).remove();
                        }
                        iElement.removeData("buttonElements");
                    });
                }
            }
        };
    });
})(angular);
(function (angular) {
    // Patch for ng-switch to fire an event whenever the children change.

    var ng = angular.module("ng");
    ng.directive("ngSwitch",
        function () {
            return {
                restrict:'EA',
                compile:function (element, attr) {
                    var watchExpr = attr.ngSwitch || attr.on;
                    return function (scope, element) {
                        scope.$watch(watchExpr, function (value) {
                            element.trigger("$childrenChanged");
                        });
                    }
                }
            }
        });
})(angular);
(function (angular) {
    // Patch for ng-include to fire an event whenever the children change.

    var ng = angular.module("ng");
    ng.directive("ngInclude",
        function () {
            return {
                restrict:'ECA',
                compile:function (element, attr) {
                    var srcExp = attr.ngInclude || attr.src;
                    return function (scope, element) {
                        scope.$watch(srcExp, function (src) {
                            element.trigger("$childrenChanged");
                        });
                        scope.$on("$includeContentLoaded", function() {
                            element.trigger("$childrenChanged");
                        });
                    }
                }
            }
        });
})(angular);
(function ($, angular) {
    var mod = angular.module('ng');

    function inputDirectivePatch() {
        return {
            restrict:'E',
            require:'?ngModel',
            compile:function (tElement, tAttrs) {
                var type = tElement.attr('type');
                return {
                    pre:function (scope, iElement, iAttrs, ctrl) {
                        if (!ctrl) {
                            return;
                        }
                        var listenToEvents = [];
                        if (type === 'date') {
                            // Angular binds to the input or keydown+change event.
                            // However, date inputs on IOS5 do not fire any of those (only the blur event).
                            // See ios5 bug TODO
                            listenToEvents.push("blur");
                        }
                        // always bind to the change event, if angular would only listen to the "input" event.
                        // Needed as jqm often fires change events when the input widgets change...
                        listenToEvents.push("change");

                        var _bind = iElement.bind;
                        iElement.bind = function (events, callback) {
                            if (events.indexOf('input') != -1 || events.indexOf('change') != -1) {
                                for (var i=0; i<listenToEvents.length; i++) {
                                    var event = listenToEvents[i];
                                    if (events.indexOf(event)===-1) {
                                        events+=" "+event;
                                    }
                                }
                            }
                            return _bind.call(this, events, callback);
                        };
                    }
                }
            }
        };
    }

    mod.directive("input", inputDirectivePatch);
    mod.directive("textarea", inputDirectivePatch);
})($, angular);


(function (angular) {
    /*
     * Defines the ng:if tag. This is useful if jquery mobile does not allow
     * an ng-switch element in the dom, e.g. between ul and li.
     */
    var ngIfDirective = {
        transclude:'element',
        priority:1000,
        terminal:true,
        compile:function (element, attr, linker) {
            return function (scope, iterStartElement, attr) {
                iterStartElement[0].doNotMove = true;
                var expression = attr.ngmIf;
                var lastElement;
                var lastScope;
                scope.$watch(expression, function (newValue) {
                    if (lastElement) {
                        lastElement.remove();
                        lastElement = null;
                    }
                    if (lastScope) {
                        lastScope.$destroy();
                        lastScope = null;
                    }
                    if (newValue) {
                        lastScope = scope.$new();
                        linker(lastScope, function (clone) {
                            lastElement = clone;
                            iterStartElement.after(clone);
                        });
                    }
                    // Note: need to be parent() as jquery cannot trigger events on comments
                    // (angular creates a comment node when using transclusion, as ng-repeat does).
                    iterStartElement.parent().trigger("$childrenChanged");
                });
            };
        }
    };
    var ng = angular.module('ng');
    ng.directive('ngmIf', function () {
        return ngIfDirective;
    });
})(angular);

(function (angular) {
    var mod = angular.module('ng');

    function registerEventHandler(scope, $parse, element, eventType, handler) {
        var fn = $parse(handler);
        element.bind(eventType, function (event) {
            scope.$apply(function() {
                fn(scope, {$event:event});
            });
            if (eventType.charAt(0) == 'v') {
                // This is required to prevent a second
                // click event, see
                // https://github.com/jquery/jquery-mobile/issues/1787
                event.preventDefault();
            }
        });
    }

    function createEventDirective(directive, eventType) {
        mod.directive(directive, ['$parse', function ($parse) {
            return function (scope, element, attrs) {
                var eventHandler = attrs[directive];
                registerEventHandler(scope, $parse, element, eventType, eventHandler);
            };
        }]);
    }

    // See http://jquerymobile.com/demos/1.2.0/docs/api/events.html
    var jqmEvents = ['tap', 'taphold', 'swipe', 'swiperight', 'swipeleft', 'vmouseover',
        'vmouseout',
        'vmousedown',
        'vmousemove',
        'vmouseup',
        'vclick',
        'vmousecancel',
        'orientationchange',
        'scrollstart',
        'scrollend',
        'pagebeforeshow',
        'pagebeforehide',
        'pageshow',
        'pagehide'
    ];
    var event, directive, i;
    for (i=0; i<jqmEvents.length; i++) {
        event = jqmEvents[i];
        directive = 'ngm' + event.substring(0, 1).toUpperCase() + event.substring(1);
        createEventDirective(directive, event);
    }

})(angular);
(function(angular) {
    var storageName = '$$sharedControllers';

    function storage(rootScope) {
        return rootScope[storageName] = rootScope[storageName] || {};
    }

    function sharedCtrl(rootScope, controllerName, $controller, usedInPage) {
        var store = storage(rootScope);
        var scopeInstance = store[controllerName];
        if (!scopeInstance) {
            scopeInstance = rootScope.$new();
            $controller(controllerName, {$scope: scopeInstance});
            store[controllerName] = scopeInstance;
            scopeInstance.$$referenceCount = 0;
        }
        scopeInstance.$$referenceCount++;
        usedInPage.bind("$destroy", function() {
            scopeInstance.$$referenceCount--;
            if (scopeInstance.$$referenceCount===0) {
                scopeInstance.$destroy();
                delete store[controllerName];
            }
        });
        return scopeInstance;
    }

    function parseSharedControllersExpression(expression) {
        var pattern = /([^\s,:]+)\s*:\s*([^\s,:]+)/g;
        var match;
        var hasData = false;
        var controllers = {};
        while (match = pattern.exec(expression)) {
            hasData = true;
            controllers[match[1]] = match[2];
        }
        if (!hasData) {
            throw "Expression " + expression + " needs to have the syntax <name>:<controller>,...";
        }
        return controllers;
    }

    var mod = angular.module('ng');
    mod.directive('ngmSharedController', ['$controller', function($controller) {
        return {
            scope: true,
            compile: function(element, attrs) {
                var expression = attrs.ngmSharedController;
                var controllers = parseSharedControllersExpression(expression);
                var preLink = function(scope) {
                    for (var name in controllers) {
                        scope[name] = sharedCtrl(scope.$root, controllers[name], $controller, element);
                    }
                };
                return {
                    pre: preLink
                }
            }
        };
    }]);
})(angular);
(function ($, angular) {

    function waitDialogFactory(rootScope) {

        var showCalls = [];

        function onClick(event) {
            var lastCall = showCalls[showCalls.length - 1];
            if (lastCall.callback) {
                rootScope.$apply(function () {
                    lastCall.callback.apply(this, arguments);
                });
            }
            // This is required to prevent a second
            // click event, see
            // https://github.com/jquery/jquery-mobile/issues/1787
            event.preventDefault();
        }

        var loadDialog;

        $(document).delegate(".ui-loader", "vclick", onClick);

        if (!$.mobile.loader.prototype.options.textWithCancel) {
            $.mobile.loader.prototype.options.textWithCancel = 'Loading. Click to cancel.';
        }

        function updateUi() {
            if (!$.mobile.firstPage) {
                rootScope.$on("jqmInit", updateUi);
                return;
            }
            if (showCalls.length > 0) {
                var lastCall = showCalls[showCalls.length - 1];
                var msg = lastCall.msg;
                if (msg) {
                    $.mobile.loading('show', {text:msg, textVisible:!!msg});
                } else {
                    $.mobile.loading('show');
                }
            } else {
                $.mobile.loading('hide');
            }
        }

        /**
         * jquery mobile hides the wait dialog when pages are transitioned.
         * This immediately closes wait dialogs that are opened in the pagebeforeshow event.
         */
        $('div').live('pageshow', function (event, ui) {
            updateUi();
        });

        /**
         *
         * @param msg (optional)
         * @param tapCallback (optional)
         */
        function show() {
            var msg, tapCallback;
            if (typeof arguments[0] == 'string') {
                msg = arguments[0];
            }
            if (typeof arguments[0] == 'function') {
                tapCallback = arguments[0];
            }
            if (typeof arguments[1] == 'function') {
                tapCallback = arguments[1];
            }

            showCalls.push({msg:msg, callback:tapCallback});
            updateUi();
        }

        function hide() {
            showCalls.pop();
            updateUi();
        }

        function always(promise, callback) {
            promise.then(callback, callback);
        }

        /**
         *
         * @param promise
         * @param msg (optional)
         */
        function waitFor(promise, msg) {
            show(msg);
            always(promise, function () {
                hide();
            });
        }

        /**
         *
         * @param deferred
         * @param cancelData
         * @param msg (optional)
         */
        function waitForWithCancel(deferred, cancelData, msg) {
            if (!msg) {
                msg = $.mobile.loader.prototype.options.textWithCancel;
            }
            show(msg, function () {
                deferred.reject(cancelData);
            });
            always(deferred.promise, function () {
                hide();
            });
        }

        return {
            show:show,
            hide:hide,
            waitFor:waitFor,
            waitForWithCancel:waitForWithCancel
        };
    }

    var mod = angular.module('ng');
    mod.factory('$waitDialog', ['$rootScope', waitDialogFactory]);
})($, angular);
(function ($, angular) {

    function pagedListFilterFactory(defaultListPageSize) {

        return function (list, stateProperty, operator) {
            if (!list) {
                return list;
            }
            if (!stateProperty) {
                throw new Error("Missing pager property");
            }
            var scope = this;
            var state = scope[stateProperty];
            if (!state) {
                state = scope[stateProperty] = {
                    loadMore: function() {
                        this.loadMoreCalled = true;
                    }
                };
            }
            var pageSize = operator ? (+operator) : defaultListPageSize;
            var endIndex = state.endIndex || pageSize;
            if (state.loadMoreCalled) {
                state.loadMoreCalled = false;
                endIndex += pageSize;
            }
            if (endIndex >= list.length) {
                endIndex = list.length;
            }
            if (endIndex < pageSize) {
                endIndex = pageSize;
            }
            state.hasMore = endIndex < list.length;
            state.endIndex = endIndex;
            state.cache = list.slice(0, endIndex);
            return state.cache;
        }
    }

    pagedListFilterFactory.$inject = ['defaultListPageSize'];
    var mod = angular.module(['ng']);
    mod.constant('defaultListPageSize', 10);
    mod.filter('paged', pagedListFilterFactory);
})($, angular);
});