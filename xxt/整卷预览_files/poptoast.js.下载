/**
 * Created by zhegxiaofang on 2019/7/22.
 * 弹框插件
 */
(function ($) {
    /**
     *内容,确定按钮的点击事件,取消按钮的点击事件
     * @param title
     * @param width
     * @param sureEvent
     * @param cancleEvent
     */
    $.selectDialog = function (options) {
        var defaults = {
            title: '',
            content: '',
            contentDiv:'',
            contentDivClass:'',
            sureText: "",
            cancleText: "",
            customBtn:'',
            width: 'wid440',
            baseUrl:"../../",
            closeFull:true,
            sureEvent: function () {
            },
            cancleEvent: function () {
            }
        };
        var sets = $.extend(defaults, options || {});

        // 自定义弹框的内容
        var content=sets.contentDiv?sets.contentDiv:'';

        if(sets.content){
            content='<p class="popWord fs16 colorIn">' + sets.content + '</p>'+content;
        }

        // 自定义按钮的个数
        var btns=sets.customBtn?sets.customBtn:'';
        if(sets.sureText){
            btns+= '<a href="javascript:;" class="jb_btn jb_btn_92 fr fs14 dialog_affrim">' + sets.sureText + '</a>' ;
        }
        if(sets.cancleText){
            btns+= '<a href="javascript:;" class="btnBlue btn_92_cancel fr fs14 dialog_cancle">' + sets.cancleText + '</a>';
        }
        if(btns){
            btns='<div class="popBottom shadowBox">'+btns+ '</div><div class="het72"></div>';
        }

        var selectDialog = '<div class="maskDiv"  id="popDiv1"><div class="popDiv ' + sets.width + '">' +
            '<div class="popHead">' +
            '<a href="javascript:;" class="popClose fr"><img src="'+sets.baseUrl+'images/popClose.png"></a>' +
            '<p class="fl fs18 colorDeep">' + sets.title +
            '</p>' +
            '</div>' +
            '<div class="het62"></div>' + content + btns+
            '</div></div>';


        $("body").append(selectDialog);
        $('#popDiv1').fullFadeIn();
        unScroll();

        //点击确定调用的事件
        $('#popDiv1').on('click', '.dialog_affrim', function () {
            if(sets.closeFull){
                $('#popDiv1').fullFadeOut(1000);
            }else{
                $('#popDiv1').fadeOut(1000);
            }
            setTimeout(function(){
                $('#popDiv1').off('click').remove();
            },300)
            if ($.isFunction(sets.cancleEvent)) {
                removeUnScroll();
                sets.cancleEvent();
            }
            return false;
        });
        // 点击取消调用的事件
        $('#popDiv1').show().on('click', '.dialog_cancle', function () {
            if(sets.closeFull){
                $('#popDiv1').fullFadeOut(1000);
            }else{
                $('#popDiv1').fadeOut(1000);
            }
            setTimeout(function(){
                $('#popDiv1').off('click').remove();
            },300);
            if ($.isFunction(sets.sureEvent)) {
                removeUnScroll();
                sets.sureEvent();
            }
            return true;
        });
        // 点击关闭按钮调用的事件
        $("#popDiv1 .popClose").on("click", function () {
            if(sets.closeFull){
                removeUnScroll();
                $('#popDiv1').fullFadeOut();
            }else{
                $('#popDiv1').fadeOut();
            }
            setTimeout(function(){
                $('#popDiv1').off('click').remove();
            },300)

        })
    };

    /**
     *内容,确定按钮的点击事件,取消按钮的点击事件
     * @param title
     * @param time
     */
    $.toast = function (options) {
        var defaults = {
            content: "操作成功",
            time: 1500,
            type: '',
            baseUrl: '',
            top: '180px'
        };
        var sets = $.extend(defaults, options || {});
        var iconUrl = '';
        if (sets.type === 'success') {
            iconUrl ='/exam-ans/mooc2/images/right.png';
        } else if (sets.type === 'failure') {
            iconUrl = '/exam-ans/mooc2/images/wrong.png';
        } else if (sets.type === 'loading') {
            iconUrl = '/exam-ans/mooc2/images/round.png';
        }else if (sets.type === 'notice') {
            iconUrl = '/exam-ans/mooc2/images/tips_pop.png';
        }

        if (sets.baseUrl == "" && typeof _HOST_CP2_ != "undefined" && _HOST_CP2_ != "") {
            sets.baseUrl = _HOST_CP2_;
        }
        iconUrl = sets.baseUrl + iconUrl;
        var iconTop = sets.top;
               
        var toast = iconUrl ? '<div class="toolTipBox"  style="z-index:9999; top:'+ iconTop +';" id="dialogToast"><i class="popicon"><img src="' + iconUrl + '" /></i>' + sets.content + '</div>' : '<div class="toolTipBox" id="dialogToast">' + sets.content + '</div>';
        
        $("#dialogToast").remove();
        $("body").append(toast);
        $("#dialogToast").fadeIn();

        // 自动推出
        if(sets.time > 0){
	        setTimeout(function () {
	            $("#dialogToast").fadeOut();
	            $("#dialogToast").remove();
	        }, sets.time);
	        /*
	        setTimeout(function(){
	            $("#dialogToast").remove();
	        },sets.time+3000)
	        */
        }else{
        	return function closeHanlde(){    
        		$("#dialogToast").remove();
        	};
        }
    };
})(window.jQuery);