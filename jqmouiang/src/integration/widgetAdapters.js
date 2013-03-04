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
        };
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
        };
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
        };
    }
})(angular, $);