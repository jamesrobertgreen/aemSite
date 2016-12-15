"use strict";

var global = this;

use([], function () {
    var PropertyUtils = {};

    var isObject = function (value) {
        return value === Object(value);
    }

    var isPromise = function (object) {
        return isObject(object) &&
            typeof object.promiseDispatch === "function" &&
            typeof object.inspect === "function";
    }

    /**
     * Add a .html extension to a link.
     * Link must:
     *   - Be non-empty
     *   - Start with a / (not http://)
     *   - Not end in an extension already
     */
    var addHtmlExtension = function (link) {
        if (!link) return link;
        if (link.indexOf("/") !== 0) return link;
        if (link.match(/.*\/.*\.\S+$/)) return link; // if path has an extension already
        return link + '.html';
    };

    /**
     * Uses the ExternalizerX service to build a publish link.
     */
    var publishLink = function (link) {
        if (!link) return link;
        if (link.indexOf("/") !== 0) return link;
        
        var externalizer;
        if (global.sling && global.Packages) {
            externalizer = global.sling.getService(global.Packages.com.day.cq.commons.Externalizer);
        }
        if (externalizer && externalizer.publishLink) {
            return externalizer.publishLink(resource.getResourceResolver(), link);
        }
        return link;
    };

    /**
     * absPath: absolute path to resource
     * return: promise containing future properties object
     */
    PropertyUtils.getPropertiesAbsolute = function (absPath) {
        return granite.resource.resolve(absPath).then(function (resource) {
            return resource.properties;    
        }, function (error) {
            throw new Error(error);
        });
    };

    /**
     * relPath: relative path to resource
     * return: promise containing future properties object
     */
    PropertyUtils.getPropertiesRelative = function (relPath) {
        return PropertyUtils.getPropertiesAbsolute(granite.resource.path + "/" + relPath);
    };

    /**
     * Get the style based property (set in design mode) for the current resource.
     */
    PropertyUtils.getStyleProperty = function (key) {
        return currentStyle.get(key);
    };

    PropertyUtils.getStylePropertyArray = function (key) {
        var property = PropertyUtils.getStyleProperty(key);
        return _toArray(property);
    };

    /**
     * There are two use cases this function supports.
     * 
     * Primary: Get property from current resource
     * Example: 
     * > PropertyUtils.getProperty('text') || 'default';
     *
     * Advanced: Get property from a resource different from the current resource
     * Example:
     * > var imagePropsPromise = PropertyUtils.getPropertiesRelative('image');
     * > var imageTitlePromise = PropertyUtils.getProperty('imageTitle', imagePropsPromise, 'Optional Default Title');
     *
     * The advanced use case requires that you provide this function a promise containing the properties object to use. This also
     * means that the returning object will be a promise containing the property value (and not the value itself).
     * 
     * key: key for property
     * propertiesPromise: properties object to pull value from
     * errorDefault: default value that will be returned if propertiesPromise is rejected or error occurrs
     * return: either the property value or a promise containing the future value
     */
    PropertyUtils.getProperty = function (key, propertiesPromise, errorDefault) {
        if (propertiesPromise) {
            return propertiesPromise.then(function (properties) {
                return properties[key] || errorDefault;
            }, function (error) {
                log.debug("Failed to load property " + key + ", defaulting to " + errorDefault);
                return errorDefault;  
            });
        } else {
            return granite.resource.properties[key];
        }
    };

    /**
     * Helper method for getProperty functions which need to support transformation of both promise and raw value objects.
     * This function requires two parameters and supports additional variadic arguments which will be passed to 'transformFunc'.
     * 
     * propertyPromise: Thenable holding a future property. Or the raw property value.
     * transformFunc: transformation function to call on property.
     * ...args: additional arguments to pass to 'transformFunc' function.
     */
    function _transformProperty(propertyPromise, transformFunc) {
        var args = Array.prototype.slice.call(arguments);
        var additionalArgs = args.slice(2, args.length);
        if (additionalArgs.length == 0) additionalArgs = null;

        if (Object.prototype.toString.call(propertyPromise) !== '[object JavaArray]' && isPromise(propertyPromise)) {
            return propertyPromise.then(function (property) {
                return transformFunc.apply(this, [].concat(property, additionalArgs));
            });
        } else {
            return transformFunc.apply(this, [].concat(propertyPromise, additionalArgs));
        }
    }

    /**
     * Get array value of a property. See getProperty for more details.
     */
    PropertyUtils.getPropertyArray = function (key, propertiesPromise) {
        var propertyPromise = PropertyUtils.getProperty(key, propertiesPromise);
        return _transformProperty(propertyPromise, _toArray);
    };

    function _toArray(property) {
        if (!property) {
            return property;
        }
        if (Object.prototype.toString.call(property) === '[object Array]') {
            return property;
        } else if (Object.prototype.toString.call(property) === '[object JavaArray]') {
            var arr = [];
            for (var i = 0; i < property.length; i++) {
                arr[i] = property[i];
            }
            return arr;
        } else {
            return property.split(',');
        }
    }

    /**
     * Get boolean value of a property. See getProperty for more details.
     */
    PropertyUtils.getPropertyBoolean = function (key, propertiesPromise) {
        var propertyPromise = PropertyUtils.getProperty(key, propertiesPromise);
        return _transformProperty(propertyPromise, _toBoolean);
    };

    function _toBoolean(property) {
        return (property == true || property == 'true' || property == 'yes');
    }

    /**
     * Get link value of a property. See getProperty for more details.
     * externalize: true if link should be externalized
     */
    PropertyUtils.getPropertyLink = function (key, externalize, propertiesPromise) {
        var propertyPromise = PropertyUtils.getProperty(key, propertiesPromise);
        return _transformProperty(propertyPromise, _toLink, externalize);
    };

    function _toLink(property, externalize) {
        var url = addHtmlExtension(property);
        if (externalize) {
            url = publishLink(url);
        }
        return url;
    }

    /**
     * Works with MtMultiCompositeField.js properties.
     *
     * key: The node name of the multifield property
     * type: The Java class of the items. (Example: global.Packages.com.herodigital.wcm.purestorage.model.NavigationItem).
     *       Must declare `global = this;` at top of the JavaScript use script.
     */
    PropertyUtils.getPropertyMultiFieldArray = function (key, type) {
        if (global.Packages) {
            return global.Packages.com.herodigital.wcm.purestorage.util.MultiFieldUtils.buildMultiFieldArrayFromResource(key, granite.request.nativeRequest, type);
        } else {
            log.error("Missing global.Packages! Cannot build multi field value for " + key);
            return [];
        }
    };

    /**
     * length: length of returned id, default 10
     * return: random alpha-numeric string
     */
    PropertyUtils.getRandomId = function(length) {
        length = length || 10;
        var random = "";
        var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

        for (var i = 0; i < length; i++) {
            random += possible.charAt(Math.floor(Math.random() * possible.length));
        }

        return random;
    };

    return PropertyUtils;
});
