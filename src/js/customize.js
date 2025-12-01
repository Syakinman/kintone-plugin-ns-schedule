(function (PLUGIN_ID) {
  "use strict";

  const pluginConfig = kintone.plugin.app.getConfig(PLUGIN_ID);
  const fieldStartDate = pluginConfig.start_datetime;
  const fieldTitle = pluginConfig.name;
  let calendar;
  let htmlTypeOptions = "";
  let _eventTitle = ""; //用于存储存储新建事件的标题
  let _eventType = ""; //用于存储存储新建事件的类型

  //动态读取表设计中属性
  kintone
    .api(kintone.api.url("/k/v1/preview/app/form/fields.json", true), "GET", {
      app: kintone.app.getId(),
    })
    .then((resp) => {
      const data = resp.properties["eventType"].options;
      const sorted_data = Object.entries(data).sort((a, b) => a[1].index - b[1].index);
      sorted_data.map((item) => {
        htmlTypeOptions += `<option value="${item[0]}">${item[0]}</option>`;
      });
    });

  //仅适用于通过弹出框更改Kintone记录方法
  function updateRecordByDialog(obj) {
    kintone.api("/k/v1/record", "PUT", {
      app: kintone.app.getId(),
      id: obj.id,
      record: {
        [fieldStartDate]: {
          // 'value': luxon.DateTime.fromJSDate(info.event.start).toFormat("yyyy-MM-dd")
          value: obj.date,
        },
        eventType: {
          value: obj.eventType,
        },
        title: {
          value: obj.title,
        },
      },
    });
  }

  //仅适用于通过拖放更改日历日程日期的更新方法
  function updateRecord(info) {
    kintone.api("/k/v1/record", "PUT", {
      app: kintone.app.getId(),
      id: info.event.extendedProps.rec,
      record: (function () {
        var param = {};
        param[fieldStartDate] = {
          // 'value': luxon.DateTime.fromJSDate(info.event.start).toFormat("yyyy-MM-dd")
          value: info.event.startStr,
        };
        return param;
      })(),
    });
  }

  function createRecord(info) {
    _eventTitle = document.getElementById("eventTitle").value;
    _eventType = document.getElementById("eventType").value;
    kintone
      .api("/k/v1/record.json", "POST", {
        app: kintone.app.getId(),
        record: {
          [fieldStartDate]: {
            value: info.dateStr,
          },
          eventType: {
            value: document.getElementById("eventType").value,
          },
          title: {
            value: _eventTitle,
          },
        },
      })
      .then((resp) => {
        //创建记录成功后,将新增的记录立即添加到fullcalendar上显示
        console.log("创建记录成功!kintone返回的信息为: ", resp);
        const newEvent = {
          title: _eventTitle,
          start: info.dateStr,
          rec: resp.id,
          url: location.href + "show#record=" + resp.id,
          allDay: true,
          // backgroundColor: '#fff',
          // borderColor: "#ff0000",
          // borderWidth: "2px",
          // className: 'test',
          editable: true, //允许编辑,包括移动等
          durationEditable: false, //不允许更改时间范围
        };
        calendar && calendar.addEvent(newEvent); //重新渲染新加事件
      })
      .catch((error) => {
        console.error("Failed to create record:", error);
      });
  }

  // 获取指定区间的所有记录
  function fetchRecords(appId, query, opt_offset, opt_limit, opt_records) {
    var offset = opt_offset || 0;
    var limit = opt_limit || 500;
    var allRecords = opt_records || [];
    var params = {
      app: appId,
      query: query + " limit " + limit + " offset " + offset,
    };
    return kintone.api("/k/v1/records", "GET", params).then(function (resp) {
      allRecords = allRecords.concat(resp.records);
      if (resp.records.length === limit) {
        return fetchRecords(appId, query, offset + limit, limit, allRecords);
      }
      return allRecords;
    });
  }

  // レコード一覧画面表示イベント
  kintone.events.on("app.record.index.show", function (event) {
    console.log("index show程序开始运行了!");
    const ss = performance.now(); //加载时间测试用
    const now = luxon.DateTime.local();

    if (event.viewName != "スケジュール") {
      return false;
    }
    let summary = document.createElement("span");
    summary.id = "summaryId";
    kintone.app.getHeaderMenuSpaceElement().appendChild(summary);

    new kintone.Promise(function (resolve, reject) {
      var query = kintone.app.getQueryCondition() || `${fieldStartDate}>="${now.minus({ years: 2 }).startOf("year").toFormat("yyyy-MM-dd")}"`;

      fetchRecords(kintone.app.getId(), query).then(function (records) {
        let recEvents = [];

        if (records.length !== 0) {
          for (let i = 0; i < records.length; i++) {
            let className = "schedule-in-kintone";
            let display_mode = "auto";
            let backgroundColor = "lightgreen";
            let editable = true;

            switch (records[i]["eventType"].value) {
              case "鳴本休日":
              case "計画年休":
                className = "ns-holiday";
                backgroundColor = "#f00";
                break;
              case "営業会議【本社開催】":
                className = "mtg-kasaoka";
                backgroundColor = "#f0f";
                break;
              case "営業会議【関西開催】":
                className = "mtg-kansai";
                backgroundColor = "#ff0";
                break;
              case "営業会議【オンライン開催】":
                className = "mtg-online";
                backgroundColor = "#fe0";
                break;
              case "祝日": //日本法定假日不再是通过手动录入,而是通过谷歌官方日历提示
                className = "jp-holiday";
                display_mode = "background";
                backgroundColor = "#ffb6c1";
                editable = false;
                break;
            }

            recEvents.push({
              id: records[i].$id.value,
              title: records[i][fieldTitle].value,
              start: records[i][fieldStartDate].value,
              url: location.href + "show#record=" + records[i].$id.value,
              rec: records[i].$id.value,
              eventType: records[i]["eventType"].value,
              backgroundColor: backgroundColor,
              borderColor: "#fff",
              // borderWidth: "2px",
              className: className,
              display: display_mode,
              textColor: "#000",
              allDay: true,
              editable: editable, //允许编辑,包括移动等
              durationEditable: false, //不允许更改时间范围
            }); //recEvent END
          } //end for
        }

        var evSample = {
          events: [
            {
              title: "Sample单天事件",
              start: "2025-11-01",
            },
            {
              title: "Sample多天事件",
              start: "2025-11-20",
              end: "2025-11-27",
            },
            {
              title: "Sample带链接的多天事件",
              start: "2025-11-05",
              end: "2025-11-07",
              url: "https://www.google.com",
            },
            {
              title: "Sample时间点事件",
              start: "2025-11-09 12:30:00",
              allDay: false, // will make the time show
            },
          ],
        };

        let eventSources = [
          recEvents,

          {
            // googleCalendarApiKey: "AIzaSyDpSbmakGoQamCZsxTrPiqFzh_MSysMchY",
            googleCalendarId: "ja.japanese.official#holiday@group.v.calendar.google.com", //祝日のみ
            className: "jp-holiday",
            display: "background",
            color: "#f00",
            textColor: "#f00",
            backgroundColor: "#f00",
            editable: false,
          },
          // {
          //     // googleCalendarApiKey: "AIzaSyDpSbmakGoQamCZsxTrPiqFzh_MSysMchY",
          //     googleCalendarId: "narumoto.sai@gmail.com",
          //     className: 'calendar_1',
          //     color: "#49B9A7",
          //     textColor: 'black',
          //     editable: false
          // },
          // {
          //     // googleCalendarApiKey: "AIzaSyDpSbmakGoQamCZsxTrPiqFzh_MSysMchY",
          //     googleCalendarId: "1qmmtsmed6l4m3tt16hq227r84@group.calendar.google.com",
          //     display: 'background',
          //     className: 'ns-holiday',
          //     editable: false
          // },
          evSample.events,
        ];

        // カレンダーの設定
        let calendarEl = document.getElementById("calendar");
        calendar = new FullCalendar.Calendar(calendarEl, {
          initialView: "multiMonthYear",
          // height: 50, //"auto"  使用auto时标题行将不能固定
          firstDay: 1,
          // hiddenDays: [0], //隐藏星期天
          // dayMaxEvents:10,
          editable: true, //允许可编辑(包括移动)
          showNonCurrentDates: false, // ← 隐藏上下月日期
          locale: "ja",
          headerToolbar: {
            left: "prev,next today",
            center: "title",
            right: "multiMonthYear dayGridMonth",
          },
          dateClick: (info) => {
            // if (info.date.getDay() == 0) {
            //     //星期天不添加新事件
            //     console.info('不允许在星期天创建日历项. 如真需要创建,请通过kintone直接添加记录')
            //     return
            // }
            Swal.fire({
              title: `<strong>新規イベント登録</u></strong>`,
              width: 600,
              html: `
                  <div style="text-align:left; padding: 10px 0;">
                      <div style="margin-bottom: 10px;">日付：${info.dateStr}</div>
                      <div style="display: flex; align-items: center;">
                          <span style="margin-right: 10px;">
                              種類：
                              <select name="eventType" id="eventType">
                                  ${htmlTypeOptions}
                              </select>
                          </span>
                          <input id="eventTitle" disabled>
                      </div>
                  </div>
              `,
              showCancelButton: true,
              didOpen: () => {
                const eventTypeSelect = document.getElementById("eventType");
                const eventTitleInput = document.getElementById("eventTitle");

                // 新建日历事件 初始化时，将标题设置为 select 默认值
                eventTitleInput.value = eventTypeSelect.value;

                eventTypeSelect.addEventListener("change", function () {
                  if (eventTypeSelect.value == "社内行事") {
                    eventTitleInput.value = "";
                    eventTitleInput.removeAttribute("disabled");
                  } else {
                    eventTitleInput.value = eventTypeSelect.value;
                    eventTitleInput.setAttribute("disabled", "disabled");
                  }
                });
              },
            }).then((result) => {
              if (result.isConfirmed) {
                if (!document.getElementById("eventTitle").value.length) {
                  Swal.fire("タイトルを入力してください！");
                }
                createRecord(info);
                //TODO 更新标题内容
              }
            });
          },
          eventResize: function (info) {
            //更改时间范围时事件
            // updateRecord(info);
          },
          eventDrop: function (info) {
            updateRecord(info);
          },
          googleCalendarApiKey: "AIzaSyDpSbmakGoQamCZsxTrPiqFzh_MSysMchY", //ns.sai@g api
          eventSources: eventSources,
          dayCellContent: function (arg) {
            return arg.date.getDate(); //月视图 日期不显示 "日"
          },
          eventClick: function (info) {
            let obj = {};
            info.jsEvent.preventDefault(); // 阻止默认事件

            if (/google/g.test(info.event.url)) {
              return false;
            } else {
              if (!info.jsEvent.ctrlKey && !info.jsEvent.shiftKey && !info.jsEvent.altKey) {
                //变更已登记日历项
                obj.id = info.event.id;
                Swal.fire({
                  title: `<strong><u>登録イベント変更</u></strong>`,
                  width: 600,
                  html: `
                      <div style="text-align:left; padding: 10px 0;">
                          <div>ＩＤ：${info.event.id}</div>
                          <div style="margin-bottom: 10px;">日付：<input id="dateModify" type = "date" value="${info.event.startStr}"></div>
                          <div style="display: flex; align-items: center;">
                              <span style="margin-right: 10px;">
                                  種類：
                                  <select name="eventType" id="eventType">
                                      ${htmlTypeOptions}
                                  </select>
                              </span>
                              <input id="eventTitle" disabled>
                          </div>
                      </div>
                  `,
                  showCancelButton: true,
                  didOpen: () => {
                    const eventTypeSelect = document.getElementById("eventType");
                    const eventTitleInput = document.getElementById("eventTitle");
                    document.getElementById("eventType").value = info.event.extendedProps.eventType;

                    // 初始化时，将标题设置为 select 默认值
                    eventTitleInput.value = info.event.title;

                    if (eventTypeSelect.value == "社内行事") {
                      eventTitleInput.removeAttribute("disabled");
                    }

                    eventTypeSelect.addEventListener("change", function () {
                      if (eventTypeSelect.value == "社内行事") {
                        eventTitleInput.value = "";
                        eventTitleInput.removeAttribute("disabled");
                      } else {
                        eventTitleInput.value = eventTypeSelect.value; // 将标题更新为选中的值
                        eventTitleInput.setAttribute("disabled", "disabled");
                      }
                    });
                  },
                }).then((result) => {
                  obj.date = document.getElementById("dateModify").value;
                  obj.eventType = document.getElementById("eventType").value;
                  obj.title = document.getElementById("eventTitle").value;
                  if (result.isConfirmed) {
                    updateRecordByDialog(obj);

                    let event = calendar.getEventById(obj.id);

                    if (event) {
                      event.setProp("editable", true);
                      event.setStart(new Date(obj.date + "T00:00:00+09:00"));
                      event.setEnd(null);
                      event.setProp("title", obj.title);
                      event.setExtendedProp("eventType", obj.eventType);
                    } else {
                      console.log("Event not found");
                    }
                  }
                }); //end then
              }
            }
            //ctrl+点击 打开url
            if ((info.jsEvent.ctrlKey || info.jsEvent.metaKey) && !info.jsEvent.shiftKey && !info.jsEvent.altKey) {
              if (!info.event.classNames.includes("jp-holiday")) {
                window.open(info.event.url, "_self");
              }
            }
          },

          // eventDidMount：针对每个事件的渲染，适合单个事件的自定义处理。
          eventDidMount: function (info) {
            if (info.event.extendedProps.eventType === "鳴本休日" || info.event.extendedProps.eventType === "計画年休") {
              const cell = info.el.closest(".fc-daygrid-day");
              if (cell) {
                cell.style.backgroundColor = "#ffcccc"; // ← 你想涂的颜色
              }
            }
          },

          eventsSet: function () {
            // ---------- 获取当前视图类型 ----------
            const viewType = calendar.view.type;

            // ---------- 当前视图的 anchor 日期（非今天） ----------
            const anchor = luxon.DateTime.fromJSDate(calendar.getDate());

            // ---------- 日期范围 ----------
            let start, end;

            if (viewType === "multiMonthYear") {
              // ===== 年视图：整年 =====
              start = anchor.startOf("year");
              end = anchor.endOf("year");
            } else {
              // ===== 月视图：当月 =====
              start = anchor.startOf("month");
              end = anchor.endOf("month");
            }

            const startJS = start.toJSDate();
            const endJS = end.toJSDate();

            // console.log("统计区间：", start.toISODate(), "~", end.toISODate());

            // ---------- 统计数据 ----------
            const holidaySet = new Set();
            const sundaySet = new Set();
            const overlapSet = new Set();

            let jp_holiday = 0;
            let ns_holiday = 0;
            let annual_leave = 0;

            // ---------- 计算区间内所有星期天 ----------
            let d = start;
            while (d <= end) {
              if (d.weekday === 7) {
                // Luxon: Sunday = 7
                const ds = d.toISODate();
                sundaySet.add(ds);
                holidaySet.add(ds);
              }
              d = d.plus({ days: 1 });
            }

            // ---------- 遍历当前日历实际显示的全部事件 ----------
            const allEvents = calendar.getEvents();

            allEvents.forEach((ev) => {
              const dateJS = ev.start;
              const dateLux = luxon.DateTime.fromJSDate(dateJS);
              const dateStr = dateLux.toISODate();

              if (dateJS < startJS || dateJS > endJS) return;

              const type = ev.extendedProps.eventType || "";
              const desc = ev.extendedProps.description || "";
              const sourceId = ev.source?.internalEventSource?.googleCalendarId || "";

              // ---- Kintone 鳴本休日 ----
              if (type === "鳴本休日") {
                ns_holiday++;
                holidaySet.add(dateStr);
              }

              // ---- Kintone 計画年休 ----
              if (type === "計画年休") {
                annual_leave++;
                holidaySet.add(dateStr);
              }

              // ---- Google 祝日 ----
              if (desc === "祝日") {
                jp_holiday++;
                holidaySet.add(dateStr);

                if (sundaySet.has(dateStr)) {
                  overlapSet.add(dateStr);
                }
              }
            });

            // ---------- 最终总数 ----------
            const total = holidaySet.size;

            // ---------- 标题 ----------
            let title = viewType === "multiMonthYear" ? `年間休日総日数：${total}日` : `${anchor.year}年${anchor.month}月の休日：${total}日`;

            document.getElementById("summaryId").innerHTML = `
              ${title}
              （🎌祝日：${jp_holiday}日；
              日曜日：${sundaySet.size}日；
              鳴本休日：${ns_holiday}日；
              計画年休：${annual_leave}日；
              ※祝日と日曜が重なる日：<span style="color:blue">△${overlapSet.size}</span>日）
            `;
          },
        }); //end of calendar

        calendar.render();
        calendar.setOption("height", window.innerHeight);
        // window.calendar=calendar;// 要放在render之后
        resolve(event);
      });
    }).then(function () {
      const ee = performance.now();
      console.log("初次加载数据所花时间:" + Math.round(ee - ss) + "豪秒");
      return event;
    });
  }); // end index.show
})(kintone.$PLUGIN_ID);
