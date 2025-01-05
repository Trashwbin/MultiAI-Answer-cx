window.safefilter = (function () {
	var doc = document,
		iframe,
		me = {
			cls: "sf-box",

			defaultStyle: "border:none;position: absolute;top: 0;left: 0; width: 100%; height: 100%; z-index:9999",

			showVerify: function (host) {
				if (iframe) {
					return;
				}
				var body = document.body;
				iframe = doc.createElement("iframe");

				//bug
				//iframe.src = host?host:"" + "/antispiderShowVerify.ac?app=1";
				iframe.src = (host ? host : "") + "/antispiderShowVerify.ac?app=1";
				iframe.className = me.cls;
				iframe.style = me.defaultStyle;

				body.append(iframe);
			},

			showVerify2: function (contextPath) {
				if (iframe) {
					return;
				}
				var body = document.body;
				iframe = doc.createElement("iframe");
				var path = contextPath || '';
				iframe.src = path + "/antispiderShowVerify.ac?app=1";
				iframe.className = me.cls;
				iframe.style = me.defaultStyle;

				body.append(iframe);
			},

			close: function () {
				if (iframe && iframe.parentNode) {
					iframe.parentNode.removeChild(iframe);
					iframe = null;
				}
			}
		};
	window.addEventListener && window.addEventListener("message", function (event) {
		if (!event || !event.data) {
			return;
		}
		var msgJson = {};
		if (typeof (event.data) === 'string') {
			try {
				msgJson = JSON.parse(event.data)
			} catch (e) {
			}
		} else {
			msgJson = event.data;
		}
		if (msgJson == null) {
			return;
		}
		if (msgJson.cmd == "closeVerifyIframe") {
			me.close();
		}
	});
	return me;
})();