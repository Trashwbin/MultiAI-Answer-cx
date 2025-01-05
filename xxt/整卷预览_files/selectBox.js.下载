(function($, window, document, undefined) {
    /**
     * 点击下拉显示
     */
    $(document).on("click", ".selectBox", function() {
        var ul = $(this).find("ul"),
            display = ul.css("display");
        display = display == "block" ? 0 : 1;
        $(".selectBox ul").css("display", "none");

        if (display) {
            $(".selectBox ").removeClass("blue-border")
            $(this).addClass("blue-border")
            ul.css("display", "block");
            display = 0;
            ul.find("li").each(function() {
                display += $(this).height();
            });
            ul.css("display", "none");
            if (display > 200) {
                ul.css("height",200);
                ul.css("overflow", "auto");
                $(".optionsCon").css("overflow", "hidden");
                //ul.addClass("select-option")
            }
            ul.slideDown(100);
        } else {
            $(this).removeClass("blue-border")
            ul.slideUp();
        }

        return false;
    });

    /**
     * 点击列表 文字和 value 上去
     */
    $(document).on("click", ".selectBox ul li", function() {
        var p = $(this).parent().parent().find("p").find("span");
        p.text($(this).find("a").text());
        p.attr("value", $(this).attr("data"));
        p.css("color","#444")
    });

    $(document).on("click", function() {
        $(".selectBox ").removeClass("blue-border")
        $(".selectBox ul").slideUp();
    });

})(jQuery, window, document);
