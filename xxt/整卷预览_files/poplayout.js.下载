
var PopLayout = {
    bodyMargin: [30,30,30,30],
    init: function(top,right,bottom,left){
        this.bodyMargin = [top, right, bottom, left];
    },
    changeMargin: function(top,right,bottom,left){
        var d = $(document.body);
        var m = this.bodyMargin;
        d.css("margin", (m[0]+top)+"px "+(m[1]+right)+"px "+(m[2]+bottom)+"px "+(m[3]+left)+"px");
    },
};
(function($){
    $.fn.extend({
        fullFadeIn:function(t,e,n,r){
        	window.BODY_ORIGIN_BACKGROUND = $(document.body).css('background') || '';
            $(document.body).css('background', 'transparent');
            setTimeout(function(){
                top.postMessage('{"cmd":1,"toggle":true}', "*");
            },50);
            return this.fadeIn(t,e,n,r);
        },
        fullFadeOut:function(t,e,n,r){
            setTimeout(function(){
                top.postMessage('{"cmd":1,"toggle":false}', "*");
                if(window.BODY_ORIGIN_BACKGROUND){
            		$(document.body).css('background', window.BODY_ORIGIN_BACKGROUND);
            	}
            },400);
            //top.postMessage('{"cmd":1,"toggle":false}', "*");
            return this.fadeOut(t,e,n,r)
        }
    });
})(jQuery);

$(function(){
    var d = $(document.body);

    // 如果本页面是嵌入的页面，调整页面布局
    if($('.Header').length==0 && $('.nav_side').length==0){

        $('head').append('<style>.clearfix:after{content: " ";display: block;height: 0px;clear: both;}</style>');
        // body透明，与父级页面配合，出现遮罩层居中弹窗
        //d.css('background', 'transparent');
        // 清除浮动窗口
        d.children(":first").addClass('clearfix');
    }

    // 记录用户原始body边距
    PopLayout.init(parseInt(d.css("margin-top")), parseInt(d.css("margin-right")), parseInt(d.css("margin-bottom")), parseInt(d.css("margin-left")));

    //监听父级页面布局变化 
    window.addEventListener("message", function(event) {
        var msgJson = null;
        try {
             msgJson = JSON.parse(event.data);
        }catch(e){
            return;
        }
        if(msgJson==null){
            return ;
        }
        switch(msgJson.cmd){
            case 1001: //修改页边框
                PopLayout.changeMargin(msgJson.top, msgJson.right, msgJson.bottom, msgJson.left);
                break;
        }

    });
});
