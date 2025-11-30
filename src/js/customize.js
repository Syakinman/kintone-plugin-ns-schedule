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

  function getSpecialDaysInfo(year) {
    // 获取指定年份内所有的星期天
    let sundays = [];
    let date = new Date(year, 0, 1); // 从1月1日开始

    // 找到第一个星期天
    while (date.getDay() !== 0) {
      date.setDate(date.getDate() + 1);
    }
    date.setDate(date.getDate() + 1); //上面的循环终止的时候,为周六,因此+1

    // 收集全年所有的星期天
    while (date.getFullYear() == parseInt(year)) {
      sundays.push(date.toISOString().split("T")[0]);
      date.setDate(date.getDate() + 7); // 移动到下一个星期天
    }

    // 获取数据的起始和结束日期
    const startOfYear = `${year}-01-01`;
    const endOfYear = `${year}-12-31`;

    return getRecords({
      app: kintone.app.getId(),
      fields: ["startDate", "title", "eventType"],
      filterCond: `eventType in ("祝日","鳴本休日","計画年休") and startDate >= "${startOfYear}" and startDate <= "${endOfYear}"`,
    }).then((resp) => {
      // 统计变量初始化
      let jp_holiday_count = 0;
      let ns_holiday_count = 0;
      let annual_paid_leave_count = 0;
      let sundays_in_jp_holiday = [];

      // 遍历数据以进行统计和查找
      resp.records.forEach((entry) => {
        const eventType = entry.eventType.value;
        const dateStr = entry.startDate.value;
        // const dateObj = new Date(dateStr);

        if (eventType === "祝日") {
          jp_holiday_count++;
          if (sundays.includes(dateStr)) {
            sundays_in_jp_holiday.push(dateStr);
          }
        } else if (eventType === "鳴本休日") {
          ns_holiday_count++;
        } else if (eventType === "計画年休") {
          annual_paid_leave_count++;
        }
      });

      // 返回结果对象
      return {
        jp_holiday_count: jp_holiday_count,
        ns_holiday_count: ns_holiday_count,
        annual_paid_leave_count: annual_paid_leave_count,
        sundays_in_jp_holiday: sundays_in_jp_holiday,
        all_sundays: sundays,
        totalDayOffCount: jp_holiday_count + ns_holiday_count + annual_paid_leave_count + sundays.length - sundays_in_jp_holiday.length,
      };
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
    // summary.innerHTML = `休日日数：<span id="total-day-off-days"></span>日（うち祝日日数：<span id="total-jp-holiday-days"></span> 日）`;
    kintone.app.getHeaderMenuSpaceElement().appendChild(summary);

    new kintone.Promise(function (resolve, reject) {
      var query = kintone.app.getQueryCondition() || `${fieldStartDate}>="${now.minus({ years: 2 }).startOf("year").toFormat("yyyy-MM-dd")}"`;

      fetchRecords(kintone.app.getId(), query).then(function (records) {
        let recEvents = [];

        if (records.length !== 0) {
          for (let i = 0; i < records.length; i++) {
            let className = "schedule1";
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
              case '営業会議【関西開催】"':
                className = "mtg-kansai";
                backgroundColor = "#ff0";
                break;
              case "営業会議【オンライン開催】":
                className = "mtg-online";
                backgroundColor = "#fe0";
                break;
              case "祝日":
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

        var ev = {
          events: [
            {
              title: "单天事件",
              start: "2024-11-01",
            },
            {
              title: "带链接的多天事件",
              start: "2024-11-05",
              end: "2022-11-07",
              url: "https://www.google.com",
            },
            {
              title: "多天事件",
              start: "2024-11-20",
              end: "2024-11-27",
            },
            {
              title: "时间点事件",
              start: "2024-11-09 12:30:00",
              allDay: false, // will make the time show
            },
          ],
        };

        let eventSources = [
          recEvents,
          //   {
          //     // googleCalendarApiKey: "AIzaSyDpSbmakGoQamCZsxTrPiqFzh_MSysMchY",
          //     //此calendar是位于narumoto.sai上面的'日本の祝日【手入力版】上面的信息
          //     googleCalendarId: "216a420766392f64a507d6cb82c7f59ebe41b3d73fdb4424189afe9352b14b30@group.calendar.google.com",
          //     id:'jp-holiday',
          //     className: 'jp-holiday',
          //     display:'background',
          //     color: '#7A7A7A',
          //     textColor: '#7A7A7A',
          //     backgroundColor: '#f00',
          //     editable: false,
          // },
          {
            // googleCalendarApiKey: "AIzaSyDpSbmakGoQamCZsxTrPiqFzh_MSysMchY",
            // 此google日历获取的是日本公共节假日及传统日子(如七五三)的公共日历,由于七五三等不属于日本法定假日因此此日历不能使用
            //ja.japanese.official#holiday@group.v.calendar.google.com 祝日のみ
            //ja.japanese#holiday@group.v.calendar.google.com　祝日及びその他の行事
            googleCalendarId: "ja.japanese.official#holiday@group.v.calendar.google.com",
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
          // ev.events
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
            //月视图 日期不显示 "日"
            return arg.date.getDate();
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
          eventsSet: function (events) {
            const currentYear = calendar.currentData.viewTitle.slice(0, 4);
            const yearStart = new Date(`${currentYear}-01-01`);
            const yearEnd = new Date(`${currentYear}-12-31T23:59:59`);

            // ---- 日期集合（最终用这个算总天数）----
            const holidaySet = new Set();
            const sundaySet = new Set();
            const holidaySundayOverlap = new Set();

            // ---- 统计参数 ----
            let jp_holiday = 0;
            let ns_holiday = 0;
            let annual_leave = 0;

            // ---- ① 计算当年所有星期天 ----
            let d = new Date(yearStart);
            while (d <= yearEnd) {
              if (d.getDay() === 0) {
                const ds = d.toISOString().substring(0, 10);
                sundaySet.add(ds);
                holidaySet.add(ds);
              }
              d.setDate(d.getDate() + 1);
            }

            // ---- ② 遍历所有事件（FullCalendar 加载的事件）----
            events.forEach((ev) => {
              const dateStr = ev.startStr;
              const dateObj = new Date(dateStr);

              // 只统计当年
              if (dateObj < yearStart || dateObj > yearEnd) return;

              const type = ev.extendedProps.eventType || "";
              const desc = ev.extendedProps.description || "";
              const sourceId = ev.source?.internalEventSource?.googleCalendarId || "";

              // ---- Kintone: 鳴本休日 ----
              if (type === "鳴本休日") {
                ns_holiday++;
                holidaySet.add(dateStr);
              }

              // ---- Kintone: 計画年休 ----
              if (type === "計画年休") {
                annual_leave++;
                holidaySet.add(dateStr);
              }

              // ---- Google Calendar 法定祝日 ----
              // 方法1：extendedProps.description === "祝日"
              // 方法2：sourceId includes ja.japanese.official
              if (desc === "祝日" || sourceId.includes("ja.japanese.official")) {
                jp_holiday++;
                holidaySet.add(dateStr);

                // 判断是否与星期天重叠
                if (sundaySet.has(dateStr)) {
                  holidaySundayOverlap.add(dateStr);
                }
              }
            });

            // ---- ③ 最终总天数（唯一日期集合大小 - 重叠数）----
            const total = holidaySet.size;

            document.getElementById("summaryId").innerHTML = `
    年間休日総日数：${total}日
    （🎌祝日：${jp_holiday}日；
    日曜日：${sundaySet.size}日；
    鳴本休日：${ns_holiday}日；
    計画年休：${annual_leave}日；
    ※祝日と日曜が重ねる日：<span style="color:blue">△${holidaySundayOverlap.size}</span>日）
  `;
          },
        }); //end of calendar

        calendar.render();
        calendar.setOption("height", window.innerHeight);
        // window.calendar=calendar;// 要放在render之后
        // let currentYear = calendar.currentData.viewTitle.slice(0, 4);

        // getSpecialDaysInfo(currentYear).then((obj) => {
        //   document.getElementById("summaryId").innerHTML = `
        //             年間休日総日数：${obj.totalDayOffCount}日
        //             （🎌祝日：${obj.jp_holiday_count}日；
        //             日曜日：${obj.all_sundays.length}日；
        //             鳴本休日：${obj.ns_holiday_count}日；
        //             計画年休：${obj.annual_paid_leave_count}日
        //             ※祝日と日曜が重ねる日：<span style="color:blue">△${obj.sundays_in_jp_holiday.length}</span>日）
        //              `;
        // });
        resolve(event);
      });
    }).then(function () {
      const ee = performance.now();
      // console.log("初次加载数据所花时间:"+(ee - ss)+"豪秒");
      return event;
    });
  }); // end index.show
})(kintone.$PLUGIN_ID);
