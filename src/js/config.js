jQuery.noConflict();
(($, PLUGIN_ID) => {
    'use strict';

    const conf = kintone.plugin.app.getConfig(PLUGIN_ID);

    $(document).ready(() => {
        kintone.api('/k/v1/preview/app/form/fields', 'GET', { app: kintone.app.getId() }).then(resp => {
            const singleLineText = [];
            const sDatetime = [];
            // const eDatetime = [];

            Object.values(resp.properties).forEach((property, index) => {
                if (property.type === 'SINGLE_LINE_TEXT') {
                    singleLineText.push({ label: property.label, key: property.code, index: String(index) });
                    const selected = conf['name'] && property.code === conf['name'] ? 'selected' : '';
                    $('#name_code').append(`<option name="${index}" ${selected}>${property.label}</option>`);
                } else if (property.type === 'DATE') {
                    sDatetime.push({ label: property.label, key: property.code, index: String(index) });
                    const startSelected = conf['start_datetime'] && property.code === conf['start_datetime'] ? 'selected' : '';
                    $('#start_datetime_code').append(`<option name="${index}" ${startSelected}>${property.label}</option>`);

                    // eDatetime.push({ label: property.label, key: property.code, index: String(index) });
                    // const endSelected = conf['end_datetime'] && property.code === conf['end_datetime'] ? 'selected' : '';
                    // $('#end_datetime_code').append(`<option name="${index}" ${endSelected}>${property.label}</option>`);
                }
            });

            $('#submit').click(() => {
                const name = singleLineText.find(item => item.index === $('#name_code :selected').attr('name'))?.key || '';
                const start_datetime = sDatetime.find(item => item.index === $('#start_datetime_code :selected').attr('name'))?.key || '';
                // const end_datetime = eDatetime.find(item => item.index === $('#end_datetime_code :selected').attr('name'))?.key || '';

                if (!name || !start_datetime) {
                    alert('入力されていない必須項目があります。');
                    return;
                }

                const config = { name, start_datetime};
                const VIEW_NAME = 'スケジュール';

                kintone.api(kintone.api.url('/k/v1/preview/app/views', true), 'GET', { app: kintone.app.getId() }).then(scheResp => {
                    const req = { ...scheResp, app: kintone.app.getId() };
                    const viewExists = Object.values(req.views).some(view => view.id === conf['viewId']);

                    if (!viewExists) {
                        Object.values(req.views).forEach(view => view.index++);

                        req.views[VIEW_NAME] = {
                            type: 'CUSTOM',
                            name: VIEW_NAME,
                            html: '<div id="calendar"></div>',
                            filterCond: '',
                            pager: false,
                            index: 0
                        };

                        kintone.api(kintone.api.url('/k/v1/preview/app/views', true), 'PUT', req).then(putResp => {
                            config['viewId'] = putResp.views[VIEW_NAME].id;
                            kintone.plugin.app.setConfig(config);
                        });
                    } else {
                        config['viewId'] = conf['viewId'];
                        kintone.plugin.app.setConfig(config);
                    }
                });
            });

            $('#cancel').click(() => history.back());
        });
    });
})(jQuery, kintone.$PLUGIN_ID);
