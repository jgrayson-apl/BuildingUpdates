/*
  Copyright 2017 Esri

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.​
*/

define([
  "calcite",
  "dojo/_base/declare",
  "ApplicationBase/ApplicationBase",
  "dojo/i18n!./nls/resources",
  "ApplicationBase/support/itemUtils",
  "ApplicationBase/support/domHelper",
  "dojo/_base/Color",
  "dojo/colors",
  "dojo/number",
  "dojo/date/locale",
  "dojo/on",
  "dojo/query",
  "dojo/dom",
  "dojo/dom-class",
  "dojo/dom-construct",
  "esri/identity/IdentityManager",
  "esri/core/Evented",
  "esri/core/watchUtils",
  "esri/core/promiseUtils",
  "esri/portal/Portal",
  "esri/layers/Layer",
  "esri/geometry/Extent",
  "esri/Graphic",
  "esri/widgets/Feature",
  "esri/widgets/FeatureForm",
  "esri/widgets/Home",
  "esri/widgets/Search",
  "esri/widgets/LayerList",
  "esri/widgets/Legend",
  "esri/widgets/ScaleBar",
  "esri/widgets/Compass",
  "esri/widgets/BasemapGallery",
  "esri/widgets/Expand"
], function (calcite, declare, ApplicationBase, i18n, itemUtils, domHelper,
             Color, colors, number, locale, on, query, dom, domClass, domConstruct,
             IdentityManager, Evented, watchUtils, promiseUtils, Portal, Layer, Extent,
             Graphic, Feature, FeatureForm, Home, Search, LayerList, Legend, ScaleBar, Compass, BasemapGallery, Expand) {

  return declare([Evented], {

    /**
     *
     */
    constructor: function () {
      this.CSS = {
        loading: "configurable-application--loading"
      };
      this.base = null;

      // CALCITE WEB //
      calcite.init();
    },

    /**
     *
     * @param base
     */
    init: function (base) {
      if(!base) {
        console.error("ApplicationBase is not defined");
        return;
      }
      domHelper.setPageLocale(base.locale);
      domHelper.setPageDirection(base.direction);

      this.base = base;
      const config = base.config;
      const results = base.results;
      const find = config.find;
      const marker = config.marker;

      const allMapAndSceneItems = results.webMapItems.concat(results.webSceneItems);
      const validMapItems = allMapAndSceneItems.map(function (response) {
        return response.value;
      });

      const firstItem = validMapItems[0];
      if(!firstItem) {
        console.error("Could not load an item to display");
        return;
      }
      config.title = (config.title || itemUtils.getItemTitle(firstItem));
      domHelper.setPageTitle(config.title);

      const viewProperties = itemUtils.getConfigViewProperties(config);
      viewProperties.container = "view-container";
      viewProperties.constraints = { snapToZoom: false };

      const portalItem = this.base.results.applicationItem.value;
      const appProxies = (portalItem && portalItem.appProxies) ? portalItem.appProxies : null;

      itemUtils.createMapFromItem({ item: firstItem, appProxies: appProxies }).then((map) => {
        viewProperties.map = map;
        itemUtils.createView(viewProperties).then((view) => {
          itemUtils.findQuery(find, view).then(() => {
            itemUtils.goToMarker(marker, view).then(() => {
              this.viewReady(config, firstItem, view).then(() => {
                domClass.remove(document.body, this.CSS.loading);
              });
            });
          });
        });
      });
    },

    /**
     *
     * @param config
     * @param item
     * @param view
     */
    viewReady: function (config, item, view) {

      // TITLE //
      dom.byId("app-title-node").innerHTML = config.title;

      // LOADING //
      const updating_node = domConstruct.create("div", { className: "view-loading-node loader" });
      domConstruct.create("div", { className: "loader-bars" }, updating_node);
      domConstruct.create("div", { className: "loader-text font-size--3 text-white", innerHTML: "Updating..." }, updating_node);
      view.ui.add(updating_node, "bottom-right");
      watchUtils.init(view, "updating", (updating) => {
        domClass.toggle(updating_node, "is-active", updating);
      });


      // USER SIGN IN //
      return this.initializeUserSignIn(view).always(() => {

        // MAP DETAILS //
        this.displayMapDetails(item);


        // SEARCH //
        /* const search = new Search({ view: view, searchTerm: this.base.config.search || "" });
         const searchExpand = new Expand({
           view: view,
           content: search,
           expandIconClass: "esri-icon-search",
           expandTooltip: "Search"
         });
         view.ui.add(searchExpand, { position: "top-left", index: 0 });

         // BASEMAPS //
         const basemapGalleryExpand = new Expand({
           view: view,
           content: new BasemapGallery({ view: view }),
           expandIconClass: "esri-icon-basemap",
           expandTooltip: "Basemap"
         });
         view.ui.add(basemapGalleryExpand, { position: "top-left", index: 1 });*/

        // HOME //
        // const home = new Home({ view: view });
        // view.ui.add(home, { position: "top-left", index: 0 });

        // LAYER LIST //
        this.initializeLayerList(view);

        // APPLICATION READY //
        this.applicationReady(view);

      });

    },

    /**
     *
     * @param view
     */
    initializeLayerList: function (view) {

      // CREATE OPACITY NODE //
      const createOpacityNode = (item, parent_node) => {
        const opacity_node = domConstruct.create("div", { className: "opacity-node esri-widget", title: "Layer Opacity" }, parent_node);
        // domConstruct.create("span", { className: "font-size--3", innerHTML: "Opacity:" }, opacity_node);
        const opacity_input = domConstruct.create("input", { className: "opacity-input", type: "range", min: 0, max: 1.0, value: item.layer.opacity, step: 0.01 }, opacity_node);
        on(opacity_input, "input", () => {
          item.layer.opacity = opacity_input.valueAsNumber;
        });
        item.layer.watch("opacity", (opacity) => {
          opacity_input.valueAsNumber = opacity;
        });
        opacity_input.valueAsNumber = item.layer.opacity;
        return opacity_node;
      };
      // CREATE TOOLS NODE //
      const createToolsNode = (item, parent_node) => {
        // TOOLS NODE //
        const tools_node = domConstruct.create("div", { className: "opacity-node esri-widget" }, parent_node);

        // REORDER //
        const reorder_node = domConstruct.create("div", { className: "inline-block" }, tools_node);
        const reorder_up_node = domConstruct.create("button", { className: "btn-link icon-ui-up", title: "Move layer up..." }, reorder_node);
        const reorder_down_node = domConstruct.create("button", { className: "btn-link icon-ui-down", title: "Move layer down..." }, reorder_node);
        on(reorder_up_node, "click", () => {
          view.map.reorder(item.layer, view.map.layers.indexOf(item.layer) + 1);
        });
        on(reorder_down_node, "click", () => {
          view.map.reorder(item.layer, view.map.layers.indexOf(item.layer) - 1);
        });

        // REMOVE LAYER //
        const remove_layer_node = domConstruct.create("button", { className: "btn-link icon-ui-close right", title: "Remove layer from map..." }, tools_node);
        on.once(remove_layer_node, "click", () => {
          view.map.remove(item.layer);
          this.emit("layer-removed", item.layer);
        });

        // ZOOM TO //
        const zoom_to_node = domConstruct.create("button", { className: "btn-link icon-ui-zoom-in-magnifying-glass right", title: "Zoom to Layer" }, tools_node);
        on(zoom_to_node, "click", () => {
          view.goTo(item.layer.fullExtent);
        });

        // LAYER DETAILS //
        const itemDetailsPageUrl = `${this.base.portal.url}/home/item.html?id=${item.layer.portalItem.id}`;
        domConstruct.create("a", { className: "btn-link icon-ui-description icon-ui-blue right", title: "View details...", target: "_blank", href: itemDetailsPageUrl }, tools_node);

        return tools_node;
      };
      // LAYER LIST //
      const layerList = new LayerList({
        container: "layer-list-container",
        view: view,
        listItemCreatedFunction: (evt) => {
          const item = evt.item;
          if(item.layer && item.layer.portalItem) {

            // CREATE ITEM PANEL //
            const panel_node = domConstruct.create("div", { className: "esri-widget" });

            // LAYER TOOLS //
            createToolsNode(item, panel_node);

            // OPACITY //
            createOpacityNode(item, panel_node);

            // if(item.layer.type === "imagery") {
            //   this.configureImageryLayer(view, item.layer, panel_node);
            // }

            // LEGEND //
            if(item.layer.legendEnabled) {
              const legend = new Legend({ container: panel_node, view: view, layerInfos: [{ layer: item.layer }] })
            }

            // SET ITEM PANEL //
            item.panel = {
              title: "Settings",
              className: "esri-icon-settings",
              content: panel_node
            };
          }
        }
      });

    },

    /**
     * DISPLAY MAP DETAILS
     *
     * @param portalItem
     */
    displayMapDetails: function (portalItem) {

      const portalUrl = this.base.portal ? (this.base.portal.urlKey ? `https://${this.base.portal.urlKey}.${this.base.portal.customBaseUrl}` : this.base.portal.url) : "https://www.arcgis.com";

      dom.byId("current-map-card-thumb").src = portalItem.thumbnailUrl;
      dom.byId("current-map-card-thumb").alt = portalItem.title;
      dom.byId("current-map-card-caption").innerHTML = `A map by ${portalItem.owner}`;
      dom.byId("current-map-card-caption").title = "Last modified on " + (new Date(portalItem.modified)).toLocaleString();
      dom.byId("current-map-card-title").innerHTML = portalItem.title;
      dom.byId("current-map-card-title").href = `${portalUrl}/home/item.html?id=${portalItem.id}`;
      dom.byId("current-map-card-description").innerHTML = portalItem.description;

    },

    /**
     *
     * @returns {*}
     */
    initializeUserSignIn: function (view) {

      const checkSignInStatus = () => {
        return IdentityManager.checkSignInStatus(this.base.portal.url).then(userSignIn);
      };
      IdentityManager.on("credential-create", checkSignInStatus);
      IdentityManager.on("credential-destroy", checkSignInStatus);

      // SIGN IN NODE //
      const signInNode = dom.byId("sign-in-node");
      const userNode = dom.byId("user-node");

      // UPDATE UI //
      const updateSignInUI = () => {
        if(this.base.portal.user) {
          dom.byId("user-firstname-node").innerHTML = this.base.portal.user.fullName.split(" ")[0];
          dom.byId("user-fullname-node").innerHTML = this.base.portal.user.fullName;
          dom.byId("username-node").innerHTML = this.base.portal.user.username;
          dom.byId("user-thumb-node").src = this.base.portal.user.thumbnailUrl;
          domClass.add(signInNode, "hide");
          domClass.remove(userNode, "hide");
        } else {
          domClass.remove(signInNode, "hide");
          domClass.add(userNode, "hide");
        }
        return promiseUtils.resolve();
      };

      // SIGN IN //
      const userSignIn = () => {
        this.base.portal = new Portal({ url: this.base.config.portalUrl, authMode: "immediate" });
        return this.base.portal.load().then(() => {
          this.emit("portal-user-change", {});
          return updateSignInUI();
        }).otherwise(console.warn);
      };

      // SIGN OUT //
      const userSignOut = () => {
        IdentityManager.destroyCredentials();
        this.base.portal = new Portal({});
        this.base.portal.load().then(() => {
          this.base.portal.user = null;
          this.emit("portal-user-change", {});
          return updateSignInUI();
        }).otherwise(console.warn);

      };

      // USER SIGN IN //
      on(signInNode, "click", userSignIn);

      // SIGN OUT NODE //
      const signOutNode = dom.byId("sign-out-node");
      if(signOutNode) {
        on(signOutNode, "click", userSignOut);
      }

      return checkSignInStatus();
    },

    /**
     *
     * @param view
     * @param layer_title
     * @param ready_callback
     * @returns {*}
     */
    whenLayerReady: function (view, layer_title, ready_callback) {

      const layer = view.map.layers.find(layer => {
        return (layer.title === layer_title);
      });
      if(layer) {
        return layer.load().then(() => {
          if(layer.visible) {
            return view.whenLayerView(layer).then((layerView) => {

              if(ready_callback) {
                ready_callback({ layer: layer, layerView: layerView });
              }

              if(layerView.updating) {
                return watchUtils.whenNotOnce(layerView, "updating").then(() => {
                  return { layer: layer, layerView: layerView };
                });
              } else {
                return watchUtils.whenOnce(layerView, "updating").then(() => {
                  return watchUtils.whenNotOnce(layerView, "updating").then(() => {
                    return { layer: layer, layerView: layerView };
                  });
                });
              }
            });
          } else {
            return promiseUtils.resolve({ layer: layer, layerView: null });
          }
        });
      } else {
        return promiseUtils.reject(new Error(`Can't find layer '${layer_title}'`));
      }

    },


    /**
     *
     * @param view
     * @param floorsLayer
     */
    initializeTestPanel: function (view, floorsLayer) {

      // GET ALL FLOORS BY SITE //
      const floorsQuery = floorsLayer.createQuery();
      floorsQuery.outFields = ["site_id", "Floor"];
      floorsQuery.returnDistinctValues = true;

      floorsLayer.queryFeatures(floorsQuery).then(floorsFeatureSet => {

        // GET LIST OF FLOORS BY SITE //
        const floorsBySite = floorsFeatureSet.features.reduce((infos, feature) => {
          const site = feature.attributes.site_id;
          const floor = feature.attributes.Floor;

          let floors = infos.get(site);
          if(!floors) {
            floors = [floor];
          } else {
            floors.push(floor);
          }
          infos.set(site, floors);

          return infos;
        }, new Map());

        const siteSelect = dom.byId("site-select");
        const floorSelect = dom.byId("floor-select");
        const measurementValueInput = dom.byId("measurement-input");

        floorsBySite.forEach((floors, site) => {
          domConstruct.create("option", { value: site, innerHTML: site.replace(/_/, " ") }, siteSelect);
          floors.forEach(floor => {
            domConstruct.create("option", { value: floor, innerHTML: floor }, floorSelect, "first");
          });
        });

        const updateBtn = dom.byId("update-btn");
        on(updateBtn, "click", () => {
          const site = siteSelect.value;
          const floor = +floorSelect.value;
          const measurement = query(`input[name="measurement"]:checked`)[0].dataset.type;
          const value = measurementValueInput.valueAsNumber;
          this.updateFloor(site, floor, measurement, value);
        });
        domClass.remove(updateBtn, "btn-disabled");

      });


    },


    /**
     * APPLICATION READY
     *
     * @param view
     */
    applicationReady: function (view) {


      const buildingsLayer = view.map.layers.find(layer => {
        return (layer.title === "Manhattan 3D Buildings");
      });
      buildingsLayer.load().then(() => {
        view.whenLayerView(buildingsLayer).then(buildingsLayerView => {

          // REMOVE 415 MADISON FROM THE MANHATTAN BUILDINGS LAYER //
          buildingsLayerView.filter = {
            geometry: { type: "point", x: -73.976046, y: 40.756678 },
            spatialRelationship: "disjoint"
          };

          // WHEN FINISHED WITH INITIAL DISPLAY UPDATE //
          watchUtils.whenNotOnce(buildingsLayerView, "updating", () => {

            // INTRO SLIDES //
            const slides = view.map.presentation.slides;
            slides.getItemAt(1).applyTo(view, { animate: true, duration: 6000 }).then(() => {
              slides.getItemAt(2).applyTo(view, { animate: true, duration: 3000 }).then(() => {
                /* ... */
              });
            });

            // FLOORS LAYER //
            const floorsLayer = view.map.layers.find(layer => {
              return (layer.title === "415 Madison Floor Spaces");
            });
            floorsLayer.load().then(() => {
              floorsLayer.outFields = ["*"];

              const oidField = buildingsLayer.objectIdField;

              floorsLayer.popupTemplate = {
                title: "Floor #{Floor} @ {site_id}",
                content: "Time: {Time}<br>Supply Air Temp: {supply_air_temperature}<br>Interior Space Temp: {interior_space_temperature}<br>CO2 Level: {co2_level}"
              };

              const floorSymbol = {
                type: "polygon-3d",
                symbolLayers: [
                  {
                    type: "extrude",
                    material: { color: Color.named.white },
                    castShadows: true,
                    edges: {
                      type: "solid",
                      size: 1.0,
                      color: [102, 102, 102, 0.7]
                    }
                  }
                ]
              };

              view.whenLayerView(floorsLayer).then(floorsLayerView => {

                //
                // site_id = 415_madison_ave
                //
                this.updateFloor = (site, floor, measurement, value) => {

                  const floorQuery = floorsLayer.createQuery();
                  floorQuery.where = `(Site_id = '${site}') AND (Floor = ${floor})`;

                  floorsLayer.queryFeatures(floorQuery).then(floorsFeatureSet => {

                    const floorFeature = floorsFeatureSet.features[0].clone();
                    floorFeature.attributes[measurement] = value;
                    floorFeature.attributes.Time = (new Date()).valueOf();

                    floorsLayer.applyEdits({ updateFeatures: [{ attributes: floorFeature.attributes }] }).then(applyEditsResults => {
                      const updateFeatureResult = applyEditsResults.updateFeatureResults[0];
                      if(updateFeatureResult.error) {
                        console.error(updateFeatureResult.error)
                      }
                    }, console.warn);
                  }, console.warn);

                };

                this.initializeTestPanel(view, floorsLayer);


                // RENDERER VISUAL VARIABLE STOPS BY MEASUREMENT TYPE //
                const measurementStopsByType = {
                  "supply_air_temperature": [
                    { value: 50.0, color: Color.named.white },
                    { value: 72.5, color: Color.named.orange },
                    { value: 75.5, color: Color.named.red }
                  ],
                  "interior_space_temperature": [
                    { value: 70.0, color: Color.named.white },
                    { value: 74.3, color: Color.named.lime },
                    { value: 75.5, color: Color.named.darkgreen }
                  ],
                  "co2_level": [
                    { value: 0, color: Color.named.white },
                    { value: 5, color: Color.named.cyan },
                    { value: 25, color: Color.named.darkblue }
                  ]
                };

                // UPDATE FLOORS LAYER RENDERING //
                const updateFloorsRendering = () => {
                  const measurement = query(`input[name="measurement"]:checked`)[0].dataset.type;

                  floorsLayer.renderer = {
                    type: "simple",
                    symbol: floorSymbol,
                    visualVariables: [
                      {
                        type: "size",
                        axis: "height",
                        field: "floor_height",
                        valueUnit: "feet"
                      },
                      {
                        type: "color",
                        field: measurement,
                        stops: measurementStopsByType[measurement]
                      }
                    ]
                  };
                };

                // USER SELECTS MEASUREMENT TYPE //
                query(`input[name="measurement"]`).on("click", () => {
                  updateFloorsRendering();
                });

                // SET INITIAL FLOOR RENDERING //
                updateFloorsRendering();

                // MEASUREMENT PANEL //
                const measurementPanel = dom.byId("measurement-panel");
                view.ui.add(measurementPanel, { position: "top-right", index: 0 });
                domClass.remove(measurementPanel, "hide");

                // LEGEND //
                const legend = new Legend({ view: view, layerInfos: [{ layer: floorsLayer }] });
                view.ui.add(legend, { position: "top-right", index: 1 });


                // POPUP DOCKING OPTIONS //
                view.popup.dockEnabled = true;
                view.popup.dockOptions = {
                  buttonEnabled: false,
                  breakpoint: false,
                  position: "bottom-right"
                };

                // HIGHLIGHT //
                /*
                let highlight = null;
                let selectedFeature = null;
                view.on("pointer-move", pointer_move_evt => {
                  view.hitTest(pointer_move_evt, { include: [floorsLayer] }).then(hitResponse => {

                    const floorHit = hitResponse.results.length ? hitResponse.results[0] : null;
                    if(floorHit) {
                      if((selectedFeature == null) || (floorHit.graphic.attributes[oidField] !== selectedFeature.attributes[oidField])) {
                        selectedFeature = floorHit.graphic;
                        highlight && highlight.remove();
                        highlight = floorsLayerView.highlight(floorHit.graphic);
                        if(view.popup.visible) {
                          view.popup.features = [floorHit.graphic];
                        } else {
                          view.popup.open({ features: [floorHit.graphic] });
                        }
                      }
                    } else {
                      view.popup.close();
                      highlight && highlight.remove();
                      selectedFeature = null;
                    }

                  });
                });*/

              });
            });

          });
        });
      });

    }

  });
});


/*
 const oidField = buildingsLayer.objectIdField;

                const oidQuery = floorsLayer.createQuery();
                oidQuery.outFields = ["*"];
                floorsLayer.queryFeatures(oidQuery).then(floorsFeatureSet => {

                  const oids = floorsFeatureSet.features.map(feature => {
                    return feature.attributes[oidField];
                  });

                  const getUpdatedMeasurements = (range) => {
                    const infos = oids.reduce((info, oid) => {
                      info.data[oid] = (range.min + (Math.random() * (range.max - range.min)));
                      return info;
                    }, { data: {} });
                    return infos.data;
                  };

                  const dataRangesByType = {
                    "supply_air_temperature": { min: 50.0, avg: 71.3, max: 74.0 },
                    "interior_space_temperature": { min: 0, avg: 50.0, max: 100 },
                    "co2_level": { min: 0, avg: 50.0, max: 100 }
                  };

                  const updateFloorsWithRandomValues = (measurementType) => {

                    const dataRange = dataRangesByType[measurementType];

                    const valueByOid = getUpdatedMeasurements(dataRange);

                    floorsLayer.renderer = {
                      type: "simple",
                      symbol: floorSymbol,
                      visualVariables: [
                        {
                          type: "size",
                          axis: "height",
                          field: "floor_height",
                          valueUnit: "feet"
                        },
                        {
                          type: "color",
                          valueExpression: `var data = ${JSON.stringify(valueByOid)}; return data[Text($feature.OBJECTID)];`,
                          stops: [
                            { value: dataRange.min, color: Color.named.white },
                            { value: dataRange.avg, color: Color.named.orange },
                            { value: dataRange.max, color: Color.named.red }
                          ]
                        }
                      ]
                    };
                  };

                  const updateFloorsRendering = () => {
                    const measurement = query(`input[name="measurement"]:checked`)[0].dataset.type;
                    updateFloorsWithRandomValues(measurement);
                  };

                  query(`input[name="measurement"]`).on("click", () => {
                    updateFloorsRendering();
                  });
                  updateFloorsRendering();

                }, console.warn);
 */


/*
         const updateList = dom.byId("update-times-list");
         const listUpdate = () => {
           const count = query(".time-node", updateList).length + 1;
           const time = (new Date()).toLocaleTimeString();
           domConstruct.create("div", {
             className: "time-node font-size--3",
             innerHTML: `[${count}]  ${time}`
           }, updateList);
         };

         const oidQuery = buildingsLayer.createQuery();
         oidQuery.outFields = ["*"];
         buildingsLayer.queryFeatures(oidQuery).then(oidFeatureSet => {

           const oids = oidFeatureSet.features.map(feature => {
             return feature.attributes[oidField];
           });
           const getUpdatedMeasurements = () => {
             const infos = oids.reduce((info, oid) => {
               info.data[oid] = Math.random();
               return info;
             }, { data: {} });
             return infos.data;
           };

           const updateBuildingsWithRandomValues = () => {
             const valueByOid = getUpdatedMeasurements();

             const renderer = buildingsLayer.renderer.clone();
             renderer.visualVariables = [
               {
                 type: "color",
                 valueExpression: `var data = ${JSON.stringify(valueByOid)}; return data[Text($feature.OBJECTID)];`,
                 stops: [
                   { value: 0.0, color: Color.named.white },
                   { value: 0.05, color: Color.named.cyan },
                   { value: 1.0, color: Color.named.darkblue }
                 ]
               }
             ];
             buildingsLayer.renderer = renderer;
             listUpdate();
           };


           let updateIntervalMS = 10000;
           let updateIntervalHandle = null;

           const setLayerUpdate = () => {
             clearInterval(updateIntervalHandle);
             if(updateIntervalMS > 0) {
               updateIntervalHandle = setInterval(() => {
                 updateBuildingsWithRandomValues();
               }, updateIntervalMS);
             }
           };

           const refreshInput = dom.byId("refresh-input");
           const refreshLabel = dom.byId("refresh-label");
           on(refreshInput, "input", () => {
             refreshLabel.innerHTML = refreshInput.valueAsNumber;
           });
           on(refreshInput, "change", () => {
             refreshLabel.innerHTML = refreshInput.valueAsNumber;
             updateIntervalMS = (refreshInput.valueAsNumber * 1000);
             setLayerUpdate();
           });
           setLayerUpdate();

         }, console.warn);
         */

/*
const edgeColor = new Color("#999");
edgeColor.a = 0.8;

floorsLayer.renderer = {
  type: "simple",
  symbol: {
    type: "polygon-3d",
    symbolLayers: [
      {
        type: "extrude",
        //size: floorHeightMeters,
        material: { color: Color.named.white },
        castShadows: true,
        edges: {
          type: "solid",
          size: 1.5,
          color: edgeColor
        }
      }
    ]
  },
  visualVariables: {
    type: "size",
    axis: "height",
    valueUnit: "meters",
    valueExpression :"-3.6"
  }
};*/

/*const renderer = buildingUpdatesLayer.renderer.clone();
renderer.classBreakInfos = renderer.classBreakInfos.map(cbInfo => {
  cbInfo.symbol = {
    type: "polygon-3d",
    symbolLayers: [
      {
        type: "extrude",
        size: floorHeightMeters,
        material: { color: cbInfo.symbol.color },
        castShadows: true,
        edges: {
          type: "solid",
          color: Color.named.white.concat(0.5)
        }
      }
    ]
  };
  return cbInfo;
});
buildingUpdatesLayer.renderer = renderer;*/

/*const updateFloor = (floor, status) => {

  const floorQuery = buildingUpdatesLayer.createQuery();
  floorQuery.where = `Floor = ${floor}`;

  buildingUpdatesLayer.queryFeatures(floorQuery).then(floorsFeatureSet => {

    const floorFeature = floorsFeatureSet.features[0];
    floorFeature.attributes.Status = status;

    buildingUpdatesLayer.applyEdits({ updateFeatures: [floorFeature] }).then(applyEditsResults => {
      const updateFeatureResult = applyEditsResults.updateFeatureResults[0];

      console.info(updateFeatureResult);

    }, console.warn);
  }, console.warn);

};

const floorInput = dom.byId("floor-input");
const floorLabel = dom.byId("floor-label");
on(floorInput, "input", () => {
  floorLabel.innerHTML = floorInput.valueAsNumber;
});
const statusInput = dom.byId("status-input");
const statusLabel = dom.byId("status-label");
on(statusInput, "input", () => {
  statusLabel.innerHTML = statusInput.valueAsNumber
});*/

/*const updateBtn = dom.byId("update-btn");
on(updateBtn, "click", () => {
  const floor = floorInput.valueAsNumber;
  const status = statusInput.valueAsNumber;
  updateFloor(floor, status);
});
domClass.remove(updateBtn, "btn-disabled");

const updateRandomBtn = dom.byId("update-random-btn");
on(updateRandomBtn, "click", () => {
  const floor = floorLabel.innerHTML = floorInput.valueAsNumber = Math.floor(Math.random() * 53);
  const status = statusLabel.innerHTML = statusInput.valueAsNumber = (1.0 + (Math.random() * 8.0));
  updateFloor(floor, status);
});
domClass.remove(updateRandomBtn, "btn-disabled");*/

/*const refreshInput = dom.byId("refresh-input");
const refreshLabel = dom.byId("refresh-label");
on(refreshInput, "input", () => {
  refreshLabel.innerHTML = refreshInput.valueAsNumber;
});
on(refreshInput, "change", () => {
  refreshLabel.innerHTML = refreshInput.valueAsNumber;
  buildingUpdatesLayer.refreshInterval = (one_second_in_minutes * refreshInput.valueAsNumber);
});

const one_second_in_minutes = (1.0 / 60);
buildingUpdatesLayer.refreshInterval = (one_second_in_minutes * refreshInput.valueAsNumber);*/